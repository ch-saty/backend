export const getChefLevel = (rating) => {
  if (rating >= 300) return "Legendary";
  if (rating >= 220) return "Michelin";
  if (rating >= 150) return "Master Chef";
  return "Sous Chef";
};
