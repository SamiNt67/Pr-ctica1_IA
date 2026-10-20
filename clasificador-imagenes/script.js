"use strict";

const URL_MODELO = "./modelo/";
const MAX_REGISTROS = 50;
const INTERVALO_HISTORIAL_CAMARA = 2000;

let modelo = null;
let webcam = null;
let ejecutando = false;
let procesando = false;
let ultimaEntradaCamara = 0;
let ultimaImagen = null;
let historial = cargarHistorial();

const $ = (id) => document.getElementById(id);
const botonIniciar = $("iniciar");
const botonDetener = $("detener");
const estado = $("estado");
const resultados = $("resultados");
const mensaje = $("mensaje");
const umbral = $("umbral");
const valorUmbral = $("valorUmbral");
const historico = $("historico");
const historicoVacio = $("historicoVacio");
const imagenSubida = $("imagenSubida");
const botonClasificarArchivo = $("clasificarArchivo");

function cargarHistorial() {
  try {
    const guardado = JSON.parse(localStorage.getItem("historialClasificador") || "[]");
    return Array.isArray(guardado) ? guardado.slice(0, MAX_REGISTROS) : [];
  } catch (error) {
    console.error("No se pudo leer el histórico guardado:", error);
    return [];
  }
}

function guardarHistorial(origen, nombre, predicciones) {
  const minimo = Number(umbral.value) / 100;
  const mejor = [...predicciones].sort((a, b) => b.probability - a.probability)[0];
  const coincide = mejor && mejor.probability >= minimo;
  const registro = {
    fecha: new Date().toLocaleString("es-ES"),
    origen,
    nombre,
    clase: coincide ? mejor.className : "Sin coincidencia",
    confianza: mejor ? Math.round(mejor.probability * 100) : 0
  };

  historial.unshift(registro);
  historial = historial.slice(0, MAX_REGISTROS);
  try {
    localStorage.setItem("historialClasificador", JSON.stringify(historial));
  } catch (error) {
    console.error("No se pudo guardar el histórico:", error);
    estado.textContent = "Clasificación completada, pero no se pudo guardar el histórico.";
  }
  mostrarHistorial();
}

function mostrarHistorial() {
  historico.replaceChildren();
  historial.forEach((registro) => {
    const elemento = document.createElement("li");
    elemento.textContent =
      `${registro.fecha} — ${registro.origen}: ${registro.nombre} — ` +
      `${registro.clase} (${registro.confianza}%)`;
    historico.appendChild(elemento);
  });
  historicoVacio.hidden = historial.length > 0;
}

function mostrarPredicciones(predicciones, nombre, origen) {
  resultados.replaceChildren();
  const minimo = Number(umbral.value) / 100;
  const ordenadas = [...predicciones].sort((a, b) => b.probability - a.probability);

  ordenadas.forEach((prediccion) => {
    const elemento = document.createElement("p");
    elemento.textContent =
      `${prediccion.className}: ${(prediccion.probability * 100).toFixed(1)}%`;
    resultados.appendChild(elemento);
  });

  const mejor = ordenadas[0];
  if (mejor && mejor.probability >= minimo) {
    mensaje.textContent =
      $("mensajePersonalizado").value.trim() || `¡Coincidencia: ${mejor.className}!`;
  } else {
    mensaje.textContent = "No hay ninguna coincidencia que supere el mínimo establecido.";
  }

  if (origen !== "Cámara" || Date.now() - ultimaEntradaCamara >= INTERVALO_HISTORIAL_CAMARA) {
    guardarHistorial(origen, nombre, ordenadas);
    if (origen === "Cámara") ultimaEntradaCamara = Date.now();
  }
}

async function cargarModelo() {
  if (modelo) return modelo;
  estado.textContent = "Cargando modelo de inteligencia artificial...";
  try {
    modelo = await tmImage.load(
      `${URL_MODELO}model.json`,
      `${URL_MODELO}metadata.json`
    );
    estado.textContent = "Modelo cargado correctamente.";
    return modelo;
  } catch (error) {
    estado.textContent =
      "No se pudo cargar el modelo. Comprueba que modelo/model.json y metadata.json estén en la carpeta.";
    console.error("Error al cargar el modelo:", error);
    throw error;
  }
}

async function iniciarCamara() {
  if (ejecutando) return;
  botonIniciar.disabled = true;
  estado.textContent = "Preparando cámara...";

  try {
    await cargarModelo();
    webcam = new tmImage.Webcam(320, 320, true);
    await webcam.setup();
    await webcam.play();
    $("camara").replaceChildren(webcam.canvas);
    ejecutando = true;
    botonDetener.disabled = false;
    estado.textContent = "Cámara activa. Analizando imágenes...";
    requestAnimationFrame(buclePredicciones);
  } catch (error) {
    if (webcam) webcam.stop();
    webcam = null;
    ejecutando = false;
    botonIniciar.disabled = false;
    botonDetener.disabled = true;
    if (!estado.textContent.startsWith("No se pudo cargar el modelo.")) {
      estado.textContent =
        "No se pudo iniciar la cámara. Comprueba los permisos y que la página se sirva por HTTP.";
    }
    console.error("No se pudo iniciar la cámara:", error);
  }
}

async function buclePredicciones() {
  if (!ejecutando || !webcam || procesando) return;
  procesando = true;
  try {
    webcam.update();
    const predicciones = await modelo.predict(webcam.canvas);
    if (ejecutando) mostrarPredicciones(predicciones, "Cámara web", "Cámara");
  } catch (error) {
    console.error("Error al clasificar:", error);
    estado.textContent = "Error al analizar la imagen.";
  } finally {
    procesando = false;
  }

  if (ejecutando) requestAnimationFrame(buclePredicciones);
}

function detenerCamara() {
  ejecutando = false;
  if (webcam) {
    webcam.stop();
    webcam = null;
  }
  $("camara").replaceChildren(Object.assign(document.createElement("p"), {
    textContent: "La vista de la cámara aparecerá aquí."
  }));
  botonIniciar.disabled = false;
  botonDetener.disabled = true;
  estado.textContent = "Cámara detenida.";
}

async function seleccionarImagen(evento) {
  const archivo = evento.target.files[0];
  botonClasificarArchivo.disabled = true;
  if (!archivo) return;
  if (!archivo.type.startsWith("image/")) {
    estado.textContent = "Selecciona un archivo de imagen válido.";
    imagenSubida.hidden = true;
    return;
  }

  if (ultimaImagen) URL.revokeObjectURL(ultimaImagen);
  ultimaImagen = URL.createObjectURL(archivo);
  try {
    const cargaImagen = new Promise((resolve, reject) => {
      imagenSubida.onload = resolve;
      imagenSubida.onerror = reject;
    });
    imagenSubida.src = ultimaImagen;
    imagenSubida.hidden = false;
    await cargaImagen;
    estado.textContent = `Imagen cargada: ${archivo.name}`;
    botonClasificarArchivo.disabled = false;
  } catch (error) {
    estado.textContent = "No se pudo abrir la imagen seleccionada.";
    console.error("Error al cargar la imagen:", error);
  }
}

async function clasificarImagenSubida() {
  if (!imagenSubida.src || imagenSubida.hidden) {
    $("resultadoArchivo").textContent = "Primero selecciona una imagen.";
    return;
  }

  botonClasificarArchivo.disabled = true;
  try {
    await cargarModelo();
    const predicciones = await modelo.predict(imagenSubida);
    mostrarPredicciones(
      predicciones,
      $("archivo").files[0]?.name || "Imagen subida",
      "Archivo"
    );
    $("resultadoArchivo").textContent =
      "Clasificación completada. Consulta las probabilidades.";
  } catch (error) {
    console.error("No se pudo clasificar la imagen:", error);
    $("resultadoArchivo").textContent =
      "No se pudo clasificar la imagen. Comprueba que el modelo esté instalado.";
  } finally {
    botonClasificarArchivo.disabled = false;
  }
}

umbral.addEventListener("input", () => {
  valorUmbral.value = `${umbral.value}%`;
  valorUmbral.textContent = `${umbral.value}%`;
});
botonIniciar.addEventListener("click", iniciarCamara);
botonDetener.addEventListener("click", detenerCamara);
$("archivo").addEventListener("change", seleccionarImagen);
botonClasificarArchivo.addEventListener("click", clasificarImagenSubida);
$("limpiar").addEventListener("click", () => {
  historial = [];
  localStorage.removeItem("historialClasificador");
  mostrarHistorial();
});

mostrarHistorial();
