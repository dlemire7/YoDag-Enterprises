export const CATEGORY_COLORS = {
  'AMER HIST':     { primary: '#E85D04', accent: '#FFBA08' },
  'WORLD HIST':    { primary: '#D00000', accent: '#FF6B6B' },
  'SCIENCE':       { primary: '#0077B6', accent: '#48CAE4' },
  'LITERATURE':    { primary: '#7B2CBF', accent: '#C77DFF' },
  'ART':           { primary: '#2D6A4F', accent: '#52B788' },
  'GEOGRAPHY':     { primary: '#3A0CA3', accent: '#7209B7' },
  'ENTERTAINMENT': { primary: '#9D4EDD', accent: '#C77DFF' },
  'POP MUSIC':     { primary: '#E040FB', accent: '#F8BBD0' },
  'CLASS MUSIC':   { primary: '#5C6BC0', accent: '#9FA8DA' },
  'FOOD/DRINK':    { primary: '#F4845F', accent: '#FFAB91' },
  'GAMES/SPORT':   { primary: '#06D6A0', accent: '#80FFDB' },
  'BUS/ECON':      { primary: '#118AB2', accent: '#48CAE4' },
  'LIFESTYLE':     { primary: '#EF476F', accent: '#FF8A9E' },
  'LANGUAGE':      { primary: '#FFD166', accent: '#FFE599' },
  'MATH':          { primary: '#073B4C', accent: '#0096C7' },
  'FILM':          { primary: '#F77F00', accent: '#FFBA08' },
  'TV':            { primary: '#7209B7', accent: '#B388FF' },
  'THEATRE':       { primary: '#D00000', accent: '#FF6B6B' },
};

export function getCategoryColor(category) {
  return CATEGORY_COLORS[category] || { primary: '#8B8994', accent: '#E8E6E3' };
}
