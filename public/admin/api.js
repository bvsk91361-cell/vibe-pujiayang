export function createAdminClient({getSession,onUnauthorized}){
 return {async request(path,{method='GET',body,signal}={}){
  const requestSession=getSession();let response;
  try{response=await fetch('/api/admin/'+path,{method,signal,credentials:'same-origin',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'}),...(method==='GET'?{}:{'X-Admin-CSRF':requestSession?.csrfToken||''})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
  catch(error){if(error.name==='AbortError')throw error;throw new Error('暂时无法连接服务，请检查本地服务后重试。');}
  const value=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(typeof value.error==='string'?value.error:value.message||'操作未完成，请稍后重试。');error.status=response.status;if(response.status===401&&!['login','session'].includes(path)&&requestSession===getSession())onUnauthorized();throw error;}
  return value;
 }};
}
