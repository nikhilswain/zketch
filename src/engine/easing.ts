export function easingFn(name: string): (t: number) => number {
  switch (name) {
    case "easeIn":
      return (t) => t * t;
    case "easeOut":
      return (t) => 1 - Math.pow(1 - t, 2);
    case "easeInOut":
      return (t) =>
        t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default:
      return (t) => t;
  }
}
