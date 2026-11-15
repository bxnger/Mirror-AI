/** Server-safe theme constants (imported by the root layout). */
export const THEME_STORAGE_KEY = "mirror-ai:theme";

/** Runs in <head> before paint. Keep it tiny and dependency-free. */
export const THEME_BOOT_SCRIPT = `(function(){try{var d=document.documentElement;var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}d.setAttribute("data-theme",t);d.style.colorScheme=t;var l=localStorage.getItem("mirror-ai:locale");if(l==="ru"||l==="kk"||l==="en")d.lang=l}catch(e){}})()`;
