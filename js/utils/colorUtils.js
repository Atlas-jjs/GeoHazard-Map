/* *
 * Generate a deterministic hex color from any string value.
 * Same input always produces the same color across sessions.
 * @param {string} str
 * @returns {string} hex color string
 */
export function hashStringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }

  let color = "#";
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff;
    color += value.toString(16).padStart(2, "0");
  }
  return color;
}

/* *
 * Given a GeoJSON, build a { value: color } map from the CODE column.
 * Returns null if CODE column does not exist.
 * Known values use a fixed hex color (FIXED_CODE_COLORS); anything else
 * falls back to a deterministic hash-based HSL color.
 * @param {object} geojson
 * @returns {object|null}
 */
export function buildCodeColorMap(geojson, fixedColors = {}, field = "CODE") {
  if (!geojson.features?.length) return null;

  const firstProps = geojson.features[0]?.properties ?? {};
  if (!(field in firstProps)) return null;

  const uniqueValues = [
    ...new Set(
      geojson.features
        .map((f) => f.properties?.[field])
        .filter((v) => v !== null && v !== undefined),
    ),
  ];

  const colorMap = {};
  uniqueValues.forEach((val) => {
    const key = String(val);
    colorMap[key] = fixedColors[key] ?? hashStringToColor(key);
  });

  return colorMap;
}
