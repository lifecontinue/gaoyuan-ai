// Supply reviewed transparent, equal-cell sprite sheets here after video cleanup.
// Example: celebrate:{url:'assets/pony/celebrate.png',frameWidth:512,frameHeight:512,frames:12,fps:10}
export type PonyClip={url:string;frameWidth:number;frameHeight:number;frames:number;fps:number};
export const ponyClips:Partial<Record<'idle'|'celebrate'|'encourage',PonyClip>>={};
