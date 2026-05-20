// NexusTerm Theme Engine — 25+ themes with full 16 ANSI color support
// Each theme: UI colors (CSS vars) + terminal colors (xterm.js)

const t = (name, category, ui, ansi) => ({
  name, category,
  ui: { base: ui[0], mantle: ui[1], crust: ui[2], surface0: ui[3], surface1: ui[4], surface2: ui[5], text: ui[6], subtext0: ui[7], subtext1: ui[8], blue: ui[9], lavender: ui[10], green: ui[11], yellow: ui[12], peach: ui[13], red: ui[14], maroon: ui[15] },
  terminal: {
    background: ui[0], foreground: ui[6], cursor: ui[14], cursorAccent: ui[0],
    selectionBackground: 'rgba(255,255,255,0.18)', selectionInactiveBackground: 'rgba(255,255,255,0.10)',
    black: ansi[0], red: ansi[1], green: ansi[2], yellow: ansi[3], blue: ansi[4], magenta: ansi[5], cyan: ansi[6], white: ansi[7],
    brightBlack: ansi[8], brightRed: ansi[9], brightGreen: ansi[10], brightYellow: ansi[11], brightBlue: ansi[12], brightMagenta: ansi[13], brightCyan: ansi[14], brightWhite: ansi[15],
  }
});

export const themes = {
  // ── Catppuccin ──
  'catppuccin-mocha': t('Catppuccin Mocha','dark',
    ['#1e1e2e','#181825','#11111b','#313244','#45475a','#585b70','#cdd6f4','#a6adc8','#bac2de','#89b4fa','#b4befe','#a6e3a1','#f9e2af','#fab387','#f38ba8','#eba0ac'],
    ['#45475a','#f38ba8','#a6e3a1','#f9e2af','#89b4fa','#f5c2e7','#94e2d5','#bac2de','#585b70','#f38ba8','#a6e3a1','#f9e2af','#89b4fa','#f5c2e7','#94e2d5','#a6adc8']),
  'catppuccin-latte': t('Catppuccin Latte','light',
    ['#eff1f5','#e6e9ef','#dce0e8','#ccd0da','#bcc0cc','#acb0be','#4c4f69','#5c5f77','#6c6f85','#1e66f5','#7287fd','#40a02b','#df8e1d','#fe640b','#d20f39','#e64553'],
    ['#5c5f77','#d20f39','#40a02b','#df8e1d','#1e66f5','#ea76cb','#179299','#acb0be','#6c6f85','#d20f39','#40a02b','#df8e1d','#1e66f5','#ea76cb','#179299','#bcc0cc']),
  'catppuccin-frappe': t('Catppuccin Frappé','dark',
    ['#303446','#292c3c','#232634','#414559','#51576d','#626880','#c6d0f5','#a5adce','#b5bfe2','#8caaee','#babbf1','#a6d189','#e5c890','#ef9f76','#e78284','#ea999c'],
    ['#51576d','#e78284','#a6d189','#e5c890','#8caaee','#f4b8e4','#81c8be','#b5bfe2','#626880','#e78284','#a6d189','#e5c890','#8caaee','#f4b8e4','#81c8be','#a5adce']),
  'catppuccin-macchiato': t('Catppuccin Macchiato','dark',
    ['#24273a','#1e2030','#181926','#363a4f','#494d64','#5b6078','#cad3f5','#a5adcb','#b8c0e0','#8aadf4','#b7bdf8','#a6da95','#eed49f','#f5a97f','#ed8796','#ee99a0'],
    ['#494d64','#ed8796','#a6da95','#eed49f','#8aadf4','#f5bde6','#8bd5ca','#b8c0e0','#5b6078','#ed8796','#a6da95','#eed49f','#8aadf4','#f5bde6','#8bd5ca','#a5adcb']),

  // ── Popular Themes ──
  'dracula': t('Dracula','dark',
    ['#282a36','#21222c','#191a21','#44475a','#6272a4','#6272a4','#f8f8f2','#bfbfbf','#e6e6e6','#8be9fd','#bd93f9','#50fa7b','#f1fa8c','#ffb86c','#ff5555','#ff79c6'],
    ['#21222c','#ff5555','#50fa7b','#f1fa8c','#bd93f9','#ff79c6','#8be9fd','#f8f8f2','#6272a4','#ff6e6e','#69ff94','#ffffa5','#d6acff','#ff92df','#a4ffff','#ffffff']),
  'nord': t('Nord','dark',
    ['#2e3440','#272c36','#20242d','#3b4252','#434c5e','#4c566a','#d8dee9','#7b88a1','#a3be8c','#81a1c1','#b48ead','#a3be8c','#ebcb8b','#d08770','#bf616a','#b48ead'],
    ['#3b4252','#bf616a','#a3be8c','#ebcb8b','#81a1c1','#b48ead','#88c0d0','#e5e9f0','#4c566a','#bf616a','#a3be8c','#ebcb8b','#81a1c1','#b48ead','#8fbcbb','#eceff4']),
  'tokyo-night': t('Tokyo Night','dark',
    ['#1a1b26','#16161e','#13131a','#24283b','#33467c','#565f89','#c0caf5','#9aa5ce','#a9b1d6','#7aa2f7','#bb9af7','#9ece6a','#e0af68','#ff9e64','#f7768e','#db4b4b'],
    ['#414868','#f7768e','#9ece6a','#e0af68','#7aa2f7','#bb9af7','#7dcfff','#a9b1d6','#565f89','#f7768e','#9ece6a','#e0af68','#7aa2f7','#bb9af7','#7dcfff','#c0caf5']),
  'one-dark': t('One Dark Pro','dark',
    ['#282c34','#21252b','#1b1f27','#2c313a','#3e4452','#5c6370','#abb2bf','#7f848e','#9da5b4','#61afef','#c678dd','#98c379','#e5c07b','#d19a66','#e06c75','#be5046'],
    ['#3e4452','#e06c75','#98c379','#e5c07b','#61afef','#c678dd','#56b6c2','#abb2bf','#5c6370','#e06c75','#98c379','#e5c07b','#61afef','#c678dd','#56b6c2','#ffffff']),
  'monokai': t('Monokai Pro','dark',
    ['#2d2a2e','#221f22','#19181a','#403e41','#5b595c','#727072','#fcfcfa','#c1c0c0','#939293','#78dce8','#ab9df2','#a9dc76','#ffd866','#fc9867','#ff6188','#ff6188'],
    ['#403e41','#ff6188','#a9dc76','#ffd866','#78dce8','#ab9df2','#78dce8','#fcfcfa','#727072','#ff6188','#a9dc76','#ffd866','#78dce8','#ab9df2','#78dce8','#ffffff']),
  'gruvbox-dark': t('Gruvbox Dark','dark',
    ['#282828','#1d2021','#1d2021','#3c3836','#504945','#665c54','#ebdbb2','#a89984','#bdae93','#83a598','#d3869b','#b8bb26','#fabd2f','#fe8019','#fb4934','#cc241d'],
    ['#3c3836','#cc241d','#98971a','#d79921','#458588','#b16286','#689d6a','#a89984','#928374','#fb4934','#b8bb26','#fabd2f','#83a598','#d3869b','#8ec07c','#ebdbb2']),
  'gruvbox-light': t('Gruvbox Light','light',
    ['#fbf1c7','#f2e5bc','#ebdbb2','#d5c4a1','#bdae93','#a89984','#3c3836','#665c54','#7c6f64','#458588','#b16286','#98971a','#d79921','#af3a03','#cc241d','#9d0006'],
    ['#665c54','#cc241d','#98971a','#d79921','#458588','#b16286','#689d6a','#7c6f64','#928374','#9d0006','#79740e','#b57614','#076678','#8f3f71','#427b58','#3c3836']),
  'solarized-dark': t('Solarized Dark','dark',
    ['#002b36','#00232e','#001e28','#073642','#586e75','#657b83','#839496','#93a1a1','#eee8d5','#268bd2','#6c71c4','#859900','#b58900','#cb4b16','#dc322f','#d33682'],
    ['#073642','#dc322f','#859900','#b58900','#268bd2','#d33682','#2aa198','#eee8d5','#002b36','#cb4b16','#586e75','#657b83','#839496','#6c71c4','#93a1a1','#fdf6e3']),
  'solarized-light': t('Solarized Light','light',
    ['#fdf6e3','#eee8d5','#e8e1cc','#eee8d5','#93a1a1','#839496','#657b83','#586e75','#073642','#268bd2','#6c71c4','#859900','#b58900','#cb4b16','#dc322f','#d33682'],
    ['#073642','#dc322f','#859900','#b58900','#268bd2','#d33682','#2aa198','#eee8d5','#002b36','#cb4b16','#586e75','#657b83','#839496','#6c71c4','#93a1a1','#fdf6e3']),
  'night-owl': t('Night Owl','dark',
    ['#011627','#010e1a','#000c17','#0b2942','#1d3b53','#5f7e97','#d6deeb','#7fdbca','#c792ea','#82aaff','#c792ea','#22da6e','#ecc48d','#f78c6c','#ef5350','#ff5874'],
    ['#1d3b53','#ef5350','#22da6e','#ecc48d','#82aaff','#c792ea','#21c7a8','#d6deeb','#5f7e97','#ef5350','#22da6e','#ecc48d','#82aaff','#c792ea','#7fdbca','#ffffff']),
  'github-dark': t('GitHub Dark','dark',
    ['#0d1117','#090d13','#060a0f','#161b22','#21262d','#30363d','#c9d1d9','#8b949e','#b1bac4','#58a6ff','#bc8cff','#3fb950','#d29922','#f0883e','#f85149','#da3633'],
    ['#484f58','#ff7b72','#3fb950','#d29922','#58a6ff','#bc8cff','#39c5cf','#b1bac4','#6e7681','#ffa198','#56d364','#e3b341','#79c0ff','#d2a8ff','#56d4dd','#f0f6fc']),
  'github-light': t('GitHub Light','light',
    ['#ffffff','#f6f8fa','#eaeef2','#d0d7de','#afb8c1','#8c959f','#1f2328','#656d76','#424a53','#0969da','#8250df','#1a7f37','#9a6700','#bc4c00','#cf222e','#a40e26'],
    ['#6e7781','#cf222e','#116329','#4d2d00','#0550ae','#8250df','#1b7c83','#424a53','#8c959f','#a40e26','#1a7f37','#633c01','#0969da','#8250df','#3192aa','#1f2328']),
  'ayu-dark': t('Ayu Dark','dark',
    ['#0a0e14','#070a0f','#05080c','#1c2433','#2d3b4d','#475b73','#b3b1ad','#626a73','#9da5b4','#39bae6','#c693ff','#7fd962','#ffb454','#ff8f40','#f07178','#d95757'],
    ['#1c2433','#f07178','#7fd962','#ffb454','#39bae6','#c693ff','#95e6cb','#b3b1ad','#475b73','#ff8f40','#aad94c','#e6b450','#59c2ff','#d2a6ff','#95e6cb','#e6e1cf']),
  'ayu-light': t('Ayu Light','light',
    ['#fafafa','#f0f0f0','#e8e8e8','#d8d8d7','#c4c4c3','#abb0b6','#575f66','#828c99','#6c7680','#399ee6','#a37acc','#86b300','#f2ae49','#fa8d3e','#f07171','#e65050'],
    ['#abb0b6','#f07171','#86b300','#f2ae49','#399ee6','#a37acc','#4cbf99','#575f66','#828c99','#e65050','#86b300','#f2ae49','#399ee6','#a37acc','#4cbf99','#1a1f29']),
  'rose-pine': t('Rosé Pine','dark',
    ['#191724','#1f1d2e','#26233a','#26233a','#403d52','#524f67','#e0def4','#908caa','#c4a7e7','#9ccfd8','#c4a7e7','#31748f','#f6c177','#ebbcba','#eb6f92','#b4637a'],
    ['#26233a','#eb6f92','#31748f','#f6c177','#9ccfd8','#c4a7e7','#ebbcba','#e0def4','#524f67','#eb6f92','#31748f','#f6c177','#9ccfd8','#c4a7e7','#ebbcba','#e0def4']),
  'rose-pine-moon': t('Rosé Pine Moon','dark',
    ['#232136','#2a273f','#393552','#393552','#44415a','#56526e','#e0def4','#908caa','#c4a7e7','#9ccfd8','#c4a7e7','#3e8fb0','#f6c177','#ea9a97','#eb6f92','#b4637a'],
    ['#393552','#eb6f92','#3e8fb0','#f6c177','#9ccfd8','#c4a7e7','#ea9a97','#e0def4','#56526e','#eb6f92','#3e8fb0','#f6c177','#9ccfd8','#c4a7e7','#ea9a97','#e0def4']),
  'vesper': t('Vesper','dark',
    ['#101010','#0a0a0a','#050505','#1c1c1c','#2a2a2a','#3a3a3a','#d4d4d4','#8b8b8b','#a3a3a3','#82aaff','#c792ea','#c3e88d','#ffcb6b','#f78c6c','#ff5370','#ff5370'],
    ['#2a2a2a','#ff5370','#c3e88d','#ffcb6b','#82aaff','#c792ea','#89ddff','#d4d4d4','#545454','#ff5370','#c3e88d','#ffcb6b','#82aaff','#c792ea','#89ddff','#ffffff']),
  'kanagawa': t('Kanagawa','dark',
    ['#1f1f28','#191922','#16161d','#2a2a37','#363646','#54546d','#dcd7ba','#727169','#c8c093','#7e9cd8','#957fb8','#98bb6c','#e6c384','#ffa066','#e82424','#ff5d62'],
    ['#16161d','#c34043','#76946a','#c0a36e','#7e9cd8','#957fb8','#6a9589','#c8c093','#727169','#e82424','#98bb6c','#e6c384','#7fb4ca','#938aa9','#7aa89f','#dcd7ba']),
  'everforest': t('Everforest Dark','dark',
    ['#2d353b','#272e33','#232a2e','#343f44','#475258','#56635f','#d3c6aa','#859289','#9da9a0','#7fbbb3','#d699b6','#a7c080','#dbbc7f','#e69875','#e67e80','#e67e80'],
    ['#343f44','#e67e80','#a7c080','#dbbc7f','#7fbbb3','#d699b6','#83c092','#d3c6aa','#56635f','#e67e80','#a7c080','#dbbc7f','#7fbbb3','#d699b6','#83c092','#d3c6aa']),
  'pitch-black': t('Pitch Black','dark',
    ['#000000','#000000','#000000','#111111','#1a1a1a','#222222','#d4d4d4','#a3a3a3','#b0b0b0','#6cb6ff','#dcbdfb','#56d364','#e3b341','#f0883e','#ff7b72','#ffa198'],
    ['#484f58','#ff7b72','#56d364','#e3b341','#6cb6ff','#dcbdfb','#76e4f7','#b0b0b0','#3d3d3d','#ffa198','#7ee787','#f2cc60','#79c0ff','#d2a8ff','#a5d6ff','#f0f6fc']),
  'hacker-green': t('Hacker Green','dark',
    ['#003300','#002200','#001100','#004400','#005500','#006600','#00ff00','#00cc00','#009900','#00ff00','#00ff00','#00ff00','#00ff00','#00ff00','#00ff00','#00ff00'],
    ['#001100','#00ff00','#00ff00','#00ff00','#00ff00','#00ff00','#00ff00','#00ff00','#002200','#00ff00','#00ff00','#00ff00','#00ff00','#00ff00','#00ff00','#00ff00']),
  'hacker-red': t('Hacker Red','dark',
    ['#330000','#220000','#110000','#440000','#550000','#660000','#ff0000','#cc0000','#990000','#ff0000','#ff0000','#ff0000','#ff0000','#ff0000','#ff0000','#ff0000'],
    ['#110000','#ff0000','#ff0000','#ff0000','#ff0000','#ff0000','#ff0000','#ff0000','#220000','#ff0000','#ff0000','#ff0000','#ff0000','#ff0000','#ff0000','#ff0000']),
  'hacker-blue': t('Hacker Blue','dark',
    ['#000033','#000022','#000011','#000044','#000055','#000066','#0088ff','#0066cc','#004499','#0088ff','#0088ff','#0088ff','#0088ff','#0088ff','#0088ff','#0088ff'],
    ['#000011','#0088ff','#0088ff','#0088ff','#0088ff','#0088ff','#0088ff','#0088ff','#000022','#0088ff','#0088ff','#0088ff','#0088ff','#0088ff','#0088ff','#0088ff']),
};

// ── Theme Engine: Runtime CSS Variable Injection ──

export function applyTheme(themeId) {
  const theme = themes[themeId];
  if (!theme) return null;

  const root = document.documentElement;
  Object.entries(theme.ui).forEach(([key, value]) => {
    root.style.setProperty(`--ctp-${key}`, value);
  });

  // Store active theme ID as a data attribute for external consumers
  root.setAttribute('data-theme', themeId);
  root.setAttribute('data-theme-mode', theme.category);

  return theme;
}

export function getTerminalTheme(themeId) {
  const theme = themes[themeId];
  if (!theme) return {};
  return { ...theme.terminal };
}

export function getMonacoTheme(themeId) {
  const theme = themes[themeId];
  if (!theme) return 'vs-dark';
  return theme.category === 'light' ? 'vs' : 'vs-dark';
}

export function getThemesByCategory() {
  const dark = [];
  const light = [];
  Object.entries(themes).forEach(([id, theme]) => {
    const entry = { id, ...theme };
    if (theme.category === 'light') light.push(entry);
    else dark.push(entry);
  });
  return { dark, light };
}
