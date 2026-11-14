// The light and dark switch on the public pages. These pages send no React and
// no framework script (lib/site.ts, "no script"), so the button is plain HTML
// marked data-theme-toggle and this small script, written into the page, makes
// it work. It does what components/ThemeToggle.tsx does for the game: follows
// the device until a choice is made, then remembers the choice on this device.
export const themeToggleScript = `(function(){
var b=document.querySelector('[data-theme-toggle]');if(!b)return;
var m=window.matchMedia('(prefers-color-scheme: light)'),d=document.documentElement;
function cur(){var t=d.getAttribute('data-theme');return t==='light'||t==='dark'?t:(m.matches?'light':'dark')}
function show(){var next=cur()==='dark'?'Light':'Dark';b.textContent=next;b.setAttribute('aria-label','Switch to the '+next.toLowerCase()+' theme')}
b.addEventListener('click',function(){var n=cur()==='dark'?'light':'dark';d.setAttribute('data-theme',n);try{localStorage.setItem('gg-theme',n)}catch(e){}show()});
if(m.addEventListener)m.addEventListener('change',show);
show();
})();`;
