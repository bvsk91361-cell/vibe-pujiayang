// Presentation state only; server validation remains authoritative.
export function createSubmission(onState){
 let state='idle';
 return {state:()=>state,reset(){if(state==='loading')return;state='idle';onState(state);},async run(save){
  if(state!=='idle')return {ignored:true};state='loading';onState(state);
  try{const value=await save();state='success';onState(state);return {value};}
  catch(error){state='idle';onState(state,error);return {error};}
 }};
}
