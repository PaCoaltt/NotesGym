import { calculateCompensation } from "../analytics/compensation.js";
import { weightedAverage } from "../analytics/statistics.js";

export function sensitivityPoint(notes, subject, hypothetical, coefficient=1) {
  const synthetic={matiere:subject,note:hypothetical,coefficient};
  const subjectNotes=notes.filter(n=>String(n.matiere).trim()===subject);
  const augmented=[...notes,synthetic];
  return { grade:hypothetical, subjectAverage:weightedAverage([...subjectNotes,synthetic]), globalAverage:weightedAverage(augmented), compensation:calculateCompensation(augmented).margin };
}
export function sensitivityCurve(notes,subject,coefficient=1,{min=1,max=6,step=.05}={}) {
  const points=[]; for(let grade=min;grade<=max+1e-9;grade+=step) points.push(sensitivityPoint(notes,subject,Number(grade.toFixed(4)),coefficient)); return points;
}
export function findThresholdCrossings(points, thresholds=[4,4.5,5,5.5]) {
  return thresholds.map(threshold=>{const point=points.find(p=>p.globalAverage>=threshold); return point?{threshold,grade:point.grade}:null;}).filter(Boolean);
}
