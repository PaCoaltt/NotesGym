// Convert grades between different grading systems
// Swiss system (1-6) is the base system stored in the database

export const convertGrade = (grade, fromSystem, toSystem) => {
  if (fromSystem === toSystem) return grade;
  
  // Convert to Swiss first
  let swissGrade = grade;
  if (fromSystem === 'french') {
    swissGrade = (grade / 20) * 5 + 1;
  } else if (fromSystem === 'american') {
    const letterToSwiss = { 'A': 6, 'B': 5, 'C': 4, 'D': 3, 'F': 1 };
    swissGrade = letterToSwiss[grade] || 1;
  }
  
  // Convert from Swiss to target system
  if (toSystem === 'french') {
    return ((swissGrade - 1) / 5 * 20).toFixed(1);
  } else if (toSystem === 'american') {
    if (swissGrade >= 5.5) return 'A';
    if (swissGrade >= 4.5) return 'B';
    if (swissGrade >= 3.5) return 'C';
    if (swissGrade >= 2.5) return 'D';
    return 'F';
  }
  
  return swissGrade;
};

export const formatGrade = (grade, gradingSystem) => {
  if (!grade && grade !== 0) return '-';
  
  if (gradingSystem === 'swiss') {
    return parseFloat(grade).toFixed(2);
  } else if (gradingSystem === 'french') {
    return convertGrade(grade, 'swiss', 'french');
  } else if (gradingSystem === 'american') {
    return convertGrade(grade, 'swiss', 'american');
  }
  
  return grade;
};

export const getGradeInputConfig = (gradingSystem) => {
  if (gradingSystem === 'swiss') {
    return { min: 1, step: 0.01, type: 'number' };
  } else if (gradingSystem === 'french') {
    return { min: 0, step: 0.1, type: 'number' };
  } else if (gradingSystem === 'american') {
    return { options: ['A', 'B', 'C', 'D', 'F'], type: 'select' };
  }
  
  return { min: 1, step: 0.01, type: 'number' };
};

export const normalizeGradeToSwiss = (grade, gradingSystem) => {
  if (gradingSystem === 'swiss') {
    return parseFloat(grade);
  } else if (gradingSystem === 'french') {
    return (parseFloat(grade) / 20) * 5 + 1;
  } else if (gradingSystem === 'american') {
    const letterToSwiss = { 'A': 6, 'B': 5, 'C': 4, 'D': 3, 'F': 1 };
    return letterToSwiss[grade] || 1;
  }
  
  return parseFloat(grade);
};