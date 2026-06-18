/* *
 * Fixed hex colors for known CODE values (currently the Climate layer's
 * 4 types). Any CODE value not listed here falls back to
 * hashStringToColor() so new/unexpected categories still get a color.
 */
const FIXED_CODE_COLORS = {
  "1st Type": "#D74042",
  "2nd Type": "#7C76D8",
  "3rd Type": "#E1E1E1",
  "4th Type": "#38C238",
};

/* *
 * Generate a deterministic HSL color from any string value.
 * Same input always produces the same color across sessions.
 * @param {string} str
 * @returns {string} HSL color string
 */
export function hashStringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

/* *
 * Given a GeoJSON, build a { value: color } map from the CODE column.
 * Returns null if CODE column does not exist.
 * Known values use a fixed hex color (FIXED_CODE_COLORS); anything else
 * falls back to a deterministic hash-based HSL color.
 * @param {object} geojson
 * @returns {object|null}
 */
export function buildCodeColorMap(geojson) {
  if (!geojson.features?.length) return null;

  // Check if CODE column exists on the first feature
  const firstProps = geojson.features[0]?.properties ?? {};
  if (!("CODE" in firstProps)) return null;

  const uniqueValues = [
    ...new Set(
      geojson.features
        .map((f) => f.properties?.CODE)
        .filter((v) => v !== null && v !== undefined),
    ),
  ];

  const colorMap = {};
  uniqueValues.forEach((val) => {
    const key = String(val);
    colorMap[key] = FIXED_CODE_COLORS[key] ?? hashStringToColor(key);
  });

  return colorMap;
}
