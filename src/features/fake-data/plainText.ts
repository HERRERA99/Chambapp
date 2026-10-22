export function generatePlainText(length: number): string {
  if (!Number.isInteger(length) || length < 1 || length > 100000)
    throw new Error('Longitud fuera de rango.');
  const sentences = [
    'Este es un texto de ejemplo para comprobar el contenido de una aplicación. ',
    'Cada proyecto comienza con una idea y crece con pequeños pasos. ',
    'Los datos de prueba ayudan a revisar espacios, formularios y diseños. ',
    'Una interfaz clara hace que las tareas cotidianas resulten más sencillas. ',
  ];
  let result = '';
  while (result.length < length) result += sentences[Math.floor(Math.random() * sentences.length)];
  return result.slice(0, length);
}
