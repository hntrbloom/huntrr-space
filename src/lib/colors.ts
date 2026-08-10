export function getGrayscalePalette(count: number) {
  if (count <= 0) return [];
  if (count === 1) return [{ bg: '#F5F5F5', text: '#222222' }];
  
  const start = 250; // light gray
  const end = 153; // dark gray (but 50% lighter)
  
  const palette = [];
  for (let i = 0; i < count; i++) {
    const val = Math.round(start - ((start - end) / (count - 1)) * i);
    const hex = val.toString(16).padStart(2, '0');
    const color = `#${hex}${hex}${hex}`;
    const text = val < 130 ? '#FFFFFF' : '#222222';
    palette.push({ bg: color, text });
  }
  return palette;
}
