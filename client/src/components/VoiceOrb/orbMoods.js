// Mood table for the voice orb.
// Colors only reference CSS variables that every theme in themes.js defines
// (blue, lavender, green, yellow, peach, red, maroon, subtext1, ...), so the orb
// follows the active theme. Glows are built with color-mix() at render time.
//
// pulseSeconds: period of the glow "breathing" (0 = no pulse)
// spinSeconds:  period of the outer arc rotation (0 = arcs hidden)
// glow:         0..1 glow intensity (mapped to the color-mix percentage)
// burst:        transient moods play a short one-off ring burst instead of looping

export const MOODS = {
  idle:       { colorVar: 'var(--ctp-blue)',      pulseSeconds: 0,   spinSeconds: 0,  glow: 0.3,  label: '' },
  server:     { colorVar: 'var(--ctp-green)',     pulseSeconds: 5,   spinSeconds: 24, glow: 0.35, label: 'Server running' },
  command:    { colorVar: 'var(--ctp-subtext1)',  pulseSeconds: 2.5, spinSeconds: 10, glow: 0.35, label: 'Running…' },
  installing: { colorVar: 'var(--ctp-blue)',      pulseSeconds: 1.8, spinSeconds: 3,  glow: 0.45, label: 'Installing…' },
  testing:    { colorVar: 'var(--ctp-yellow)',    pulseSeconds: 1.6, spinSeconds: 5,  glow: 0.5,  label: 'Running tests…' },
  building:   { colorVar: 'var(--ctp-peach)',     pulseSeconds: 1.2, spinSeconds: 2.5, glow: 0.55, label: 'Building…' },
  agent:      { colorVar: 'var(--ctp-lavender)',  pulseSeconds: 2,   spinSeconds: 6,  glow: 0.5,  label: 'Agent at work' },
  error:      { colorVar: 'var(--ctp-red)',       pulseSeconds: 0.5, spinSeconds: 0,  glow: 0.75, label: 'Command failed', burst: { seconds: 0.45, repeat: 2 } },
  success:    { colorVar: 'var(--ctp-green)',     pulseSeconds: 0,   spinSeconds: 0,  glow: 0.7,  label: 'Done', burst: { seconds: 0.9, repeat: 0 } },
};

/** Higher rank wins among concurrently running commands / pending approvals. */
export const RUNNING_RANK = {
  server: 1,
  command: 2,
  installing: 3,
  testing: 4,
  building: 5,
  agent: 6,
};

export const TRANSIENT_MS = 2500; // error/success decay back after this long
export const SHOW_DELAY_MS = 400; // running commands only affect the orb after this long (debounce)

export function getMood(name) {
  return MOODS[name] || MOODS.idle;
}
