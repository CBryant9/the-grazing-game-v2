// Applies a remembered light or dark choice before the first paint, so the
// page never flashes the wrong theme. With no choice, the device setting wins.
// Used by the root layout and by the error screen that replaces it.
export const themeScript = `try{var t=localStorage.getItem('gg-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;
