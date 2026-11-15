// Browser errors on the game page and the signed-in pages (milestone 5.5). Written into the page
// by the app layout, so it costs no script file and nothing against a page's script budget. The
// public website pages (apps/web/pages) never carry it: they send no script.
//
// An uncaught error or a rejected promise is sent to /api/client-error with sendBeacon, at most
// five a page. The server scrubs it and forwards it to Sentry (server/errors/clientError.ts). Only
// the error's name, its message cut to 200 characters, its stack cut to 2,000 and the page path
// go; the server turns the path into a template with no ids in it.
export const clientErrorScript = `(function(){var n=0;function s(k,e){if(n++>4||!navigator.sendBeacon)return;try{e=e||{};navigator.sendBeacon('/api/client-error',new Blob([JSON.stringify({kind:k,name:String(e.name||'').slice(0,60),message:String(e.message||e).slice(0,200),stack:String(e.stack||'').slice(0,2000),route:location.pathname.slice(0,200)})],{type:'application/json'}))}catch(x){}}addEventListener('error',function(v){s('error',v.error||{message:v.message})});addEventListener('unhandledrejection',function(v){s('rejection',v.reason)})})();`;
