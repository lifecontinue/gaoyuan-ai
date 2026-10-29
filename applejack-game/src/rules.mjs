export const CONFIG = {reward:3,hintAfterAttempts:2,feedbackMs:450};
export const harvestTasks = [
 {total:12,baskets:3,title:'给朋友装苹果'}, {total:8,baskets:2,title:'准备野餐篮'},
 {total:15,baskets:3,title:'装满集市小车'}, {total:12,baskets:2,title:'给邻居送苹果'},
 {total:9,baskets:3,title:'分享甜蜜收获'}, {total:18,baskets:3,title:'丰收节大订单'},
 {total:12,baskets:3,title:'第一份订单',targets:[5,4,3]},
 {total:15,baskets:3,title:'野餐准备',targets:[6,5,4]},
 {total:18,baskets:3,title:'丰收节配送',targets:[9,6,3]}
];
export function isEvenlyShared(locations,total,baskets){return locations.length===total && locations.every(x=>Number.isInteger(x)&&x>=0&&x<baskets)&&Array.from({length:baskets},(_,i)=>locations.filter(x=>x===i).length).every(n=>n===total/baskets);}
export function grantReward(save,id){if(save.completed.includes(id))return save;return {...save,apples:save.apples+CONFIG.reward,completed:[...save.completed,id]};}
export const slots={flowers:'flowerbed',sunflowers:'flowerbed',bunting:'entrance',sign:'entrance',table:'sharing',stall:'sharing'};
export const prices={flowers:3,sunflowers:6,bunting:6,sign:9,table:9,stall:12};
export function isOrderFilled(locations,task){return task.targets?locations.length===task.total&&locations.every(x=>Number.isInteger(x)&&x>=0&&x<task.baskets)&&task.targets.every((n,i)=>locations.filter(x=>x===i).length===n):isEvenlyShared(locations,task.total,task.baskets);}
export function validV2(x){return !!x&&x.version===2&&Number.isInteger(x.apples)&&x.apples>=0&&Array.isArray(x.completed)&&x.completed.every(id=>/^(harvest-[0-8]|mail-[0-5]|garden-[0-5])$/.test(id))&&new Set(x.completed).size===x.completed.length&&Array.isArray(x.decorations)&&x.decorations.every(id=>Object.hasOwn(slots,id))&&new Set(x.decorations).size===x.decorations.length&&typeof x.muted==='boolean'&&typeof x.reducedMotion==='boolean'&&!!x.placed&&['flowerbed','entrance','sharing'].every(slot=>x.placed[slot]===null||(x.decorations.includes(x.placed[slot])&&slots[x.placed[slot]]===slot));}
export function migrateSave(x){if(validV2(x))return x;if(!validSave(x))return null;const placed={flowerbed:null,entrance:null,sharing:null};for(const id of x.decorations)placed[slots[id]]=id;return {...x,version:2,placed};}
export function placeDecoration(save,slot,id){if(!Object.values(slots).includes(slot)||id!==null&&slots[id]!==slot)return save;const owned=id===null||save.decorations.includes(id);if(!owned&&save.apples<prices[id])return save;return {...save,apples:save.apples-(owned?0:prices[id]),decorations:owned?save.decorations:[...save.decorations,id],placed:{...save.placed,[slot]:id}};}
export function validSave(x){return !!x&&x.version===1&&Number.isInteger(x.apples)&&x.apples>=0&&Array.isArray(x.completed)&&x.completed.every(id=>/^(harvest|mail|garden)-[0-5]$/.test(id))&&new Set(x.completed).size===x.completed.length&&Array.isArray(x.decorations)&&x.decorations.every(id=>['flowers','bunting','table'].includes(id))&&new Set(x.decorations).size===x.decorations.length&&typeof x.muted==='boolean'&&typeof x.reducedMotion==='boolean';}
