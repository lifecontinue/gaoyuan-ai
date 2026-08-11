import { SUBJECTS_P3 } from '../js/data/subjects_p3.js';
import { SUBJ_COMP_TREES, subjectIndicatorAt } from '../js/domain/subjects.js';

let total=0, withCrit=0, keyOk=0, sample=null;
SUBJ_COMP_TREES.forEach((cts, si) => {
  // cts is array of comp buckets; flatten inds
  cts.forEach(ct => (ct.inds||[]).forEach(ind => {
    total++;
    if (ind.criteria) withCrit++;
    const m = /^p3-\d+-\d+-\d+$/.test(ind.key);
    if (m) keyOk++;
    if (!sample) sample = ind;
  }));
});
console.log('SUBJ_COMP_TREES 指标总数:', total);
console.log('带 criteria 的指标:', withCrit);
console.log('主键格式 p3-<si>-<ti>-<ii> 合规:', keyOk);
const a = subjectIndicatorAt(0,0,0);
console.log('首条 key=', a.key, '| text=', a.text);
console.log('首条 criteria 键=', Object.keys(a.criteria||{}));
console.log('student(meta)=', SUBJECTS_P3.meta.student);
