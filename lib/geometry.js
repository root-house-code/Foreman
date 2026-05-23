export function polygonCentroid(points) {
  return {
    cx: points.reduce((s, p) => s + p.x, 0) / points.length,
    cy: points.reduce((s, p) => s + p.y, 0) / points.length,
  };
}

export function pointInPolygon(pt, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y, xj = points[j].x, yj = points[j].y;
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
