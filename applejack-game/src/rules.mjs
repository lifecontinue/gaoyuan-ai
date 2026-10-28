export const CONFIG = {reward:3,hintAfterAttempts:2,feedbackMs:450};
export const harvestTasks = [
 {total:12,baskets:3,title:'给朋友装苹果'}, {total:8,baskets:2,title:'准备野餐篮'},
 {total:15,baskets:3,title:'装满集市小车'}, {total:12,baskets:2,title:'给邻居送苹果'},
 {total:9,baskets:3,title:'分享甜蜜收获'}, {total:18,baskets:3,title:'丰收节大订单'}
];
export function isEvenlyShared(locations,total,baskets){return locations.length===total && locations.every(x=>Number.isInteger(x)&&x>=0&&x<baskets)&&Array.from({length:baskets},(_,i)=>locations.filter(x=>x===i).length).every(n=>n===total/baskets);}
export function grantReward(save,id){if(save.completed.includes(id))return save;return {...save,apples:save.apples+CONFIG.reward,completed:[...save.completed,id]};}
export function validSave(x){return !!x&&x.version===1&&Number.isInteger(x.apples)&&x.apples>=0&&Array.isArray(x.completed)&&x.completed.every(id=>/^(harvest|mail|garden)-[0-5]$/.test(id))&&new Set(x.completed).size===x.completed.length&&Array.isArray(x.decorations)&&x.decorations.every(id=>['flowers','bunting','table'].includes(id))&&new Set(x.decorations).size===x.decorations.length&&typeof x.muted==='boolean'&&typeof x.reducedMotion==='boolean';}
