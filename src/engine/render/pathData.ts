export function toPathData(points: number[][]): string {
  const average = (a: number, b: number) => (a + b) / 2;
  const len = points.length;
  let a = points[0];
  let b = points[1];
  let c = points[2];
  let result = `M${a[0]},${a[1]} Q${b[0]},${b[1]} ${average(
    b[0],
    c[0],
  )},${average(b[1], c[1])} T`;
  for (let i = 2; i < len - 1; i++) {
    a = points[i];
    b = points[i + 1];
    result += `${average(a[0], b[0])},${average(a[1], b[1])} `;
  }
  result += "Z";
  return result;
}
