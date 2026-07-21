---
layout: post
title: "DRY for Design Assets"
description: "Design tokens and Style Dictionary: a single source of truth for colors, spacing, and typography that both designers and code generators can consume."
date: 2026-07-21
categories:
- frontend
tags:
- frontend
- styledictionary
- designtokens
- mantine
- css
---
{% assign componentgeneration = site.posts | where: "title", "Component Generation with Figma API: Bridging the Gap Between Development and Design" | first %}
{% assign frontendpost = site.posts | where: "title", "From Swagger UI to React: Building qcontroller's Frontend" | first %}

Quite some time ago, in {% if componentgeneration %}[a previous post]({{ componentgeneration.url }}){% else %}a previous post{% endif %}, I explored expressing UI components in a tech-stack-agnostic way using Figma. The idea was appealing: tech stacks come and go, but the app should stay functional. Describe the geometry of your components once, in a neutral format, and let a code generator produce your React (or QML, or SwiftUI) components.

In practice, it didn't hold up. No mainstream generator supports this workflow, so you have to build one yourself - and the number of details to get right is enormous: margins, paddings, rotations, text metrics, and all their interactions. It is not impossible, but it is a serious maintenance burden. Writing components by hand is simply easier.

But rejecting full component generation doesn't mean rejecting the idea entirely. What if at least *part* of the design could flow from a neutral representation into code? Not the components themselves - the design decisions behind them: colors, spacing, typography, radii. It turns out there is a mature answer to exactly this question: **design tokens**.

## TL;DR

- **Design tokens** put every design value (colors, spacing, fonts, radii, shadows) into a JSON file in the [W3C Design Tokens format](https://design-tokens.github.io/community-group/format/) - one source of truth that design tools and code generators both understand.
- **[Style Dictionary](https://styledictionary.com/)** generates platform assets from that file: CSS variables and JS modules for the web, and there are transforms for iOS, Android, and more.
- Components never hard-code a value; they reference tokens. Dark mode becomes a data change, not a code change.
- Implemented in the [qcontroller UI](https://github.com/q-controller/qcontroller-ui) in [PR #21](https://github.com/q-controller/qcontroller-ui/pull/21): tokens drive the Mantine theme, the CSS layer, and even an xterm terminal.

## The Problem: Design Values Repeat Themselves

Every frontend accumulates the same sin: the brand blue lives in a CSS file, again in a theme object, again in some inline style, and once more in the design tool the mockups were drawn in. Change it in one place and you begin an archaeology project. This is a textbook DRY violation - we would never tolerate it for constants in backend code, yet for design values it is somehow the norm.

Design tokens fix this by making the values data. A token file describes *what* exists - `color.blue.600`, `radius.pill`, `font.size.xs` - and everything else derives from it:

```json
{
  "color": {
    "$type": "color",
    "blue": {
      "600": { "$value": "#228be6", "$description": "Primary brand blue" }
    },
    "semantic": {
      "vm": {
        "running": {
          "indicator": { "$value": "{color.green.800}" },
          "text":      { "$value": "{color.green.900}" },
          "bg":        { "$value": "{color.green.50}" }
        }
      }
    }
  },
  "radius": {
    "$type": "dimension",
    "pill": { "$value": "999px", "$description": "status badges" }
  }
}
```

Two things are worth noticing. First, the `{color.green.800}` syntax: tokens can reference other tokens, which lets you build a **semantic layer** on top of raw palettes. Components never use "green" - they use `vm.running.indicator`, and the design decides what that means. Second, this format is a W3C community specification, supported by design tools such as Figma and Penpot. Designers keep working in their tool of choice; the tokens travel.

## Style Dictionary: The Code Generator

So do we still need a code generator? Yes - but a much smaller and battle-tested one. [Style Dictionary](https://styledictionary.com/) reads the token file and emits whatever your platforms need. The configuration is minimal:

```js
import StyleDictionary from 'style-dictionary';

export default {
  source: ['design/tokens.json'],
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: 'src/generated/',
      files: [{ destination: 'tokens.css', format: 'css/variables' }],
    },
    js: {
      transformGroup: 'js',
      buildPath: 'src/generated/',
      files: [{ destination: 'tokens.js', format: 'javascript/esm' }],
    },
  },
};
```

For the web that produces CSS custom properties - the token path becomes the variable name, references are resolved at build time:

```css
:root {
  --color-blue-600: #228be6;
  --color-semantic-vm-running-indicator: #2f9e44;
  --radius-pill: 999px;
}
```

plus a typed JS module for places where CSS variables can't reach. The same tokens can feed Android resources or iOS assets through other transform groups. In {% if frontendpost %}[qcontroller's frontend]({{ frontendpost.url }}){% else %}qcontroller's frontend{% endif %}, where code generation already produces the REST client and the WebSocket message types, tokens simply became a third generation target of `yarn generate` - generated files are never committed and never edited by hand.

## Consuming Tokens: Theme Level, Not Component Level

Generating variables is only half the story; the discipline is in how they are consumed. The rule I settled on: **components reference semantic tokens only, and no color literal exists outside the token files.** In qcontroller's UI that meant two integration points.

The [Mantine](https://mantine.dev/) theme is built from the JS module, so every standard component picks the tokens up automatically:

```ts
export const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: fontStack(tokens.font.family.sans),
  defaultRadius: 'sm',
  shadows: { xs: 'var(--shadow-card)', sm: 'var(--shadow-raised)' },
  // ...palettes, spacing, and headings, all derived from tokens
});
```

And anything custom reads the CSS variables directly. The VM status badge, for example, renders its indicator dot, text, and background from the `vm.*` triple - it names *roles*, never values:

{% raw %}
```tsx
<Badge
  styles={{
    root: {
      backgroundColor: `var(--color-semantic-vm-${kind}-bg)`,
      color: `var(--color-semantic-vm-${kind}-text)`,
      borderRadius: 'var(--radius-pill)',
    },
  }}
>
```
{% endraw %}

This even extends to components that don't paint via CSS: the log terminal (xterm) resolves the same variables at runtime with `getComputedStyle` and hands the concrete values to its renderer.

## The Payoff: Dark Mode as a Data Change

The moment this architecture proved itself was dark mode. A second token file overrides only the semantic layer - **same token names, different values** - and Style Dictionary emits it scoped to a selector:

```css
:root[data-mantine-color-scheme='dark'] {
  --color-semantic-surface-card: #1a1b1e;
  --color-semantic-vm-running-indicator: #51cf66;
}
```

When the color scheme toggles, the attribute changes and every component repaints with the new values. No conditionals in components, no second stylesheet to maintain by hand, no re-render logic. The badge, the cards, the terminal - none of them know dark mode exists.

## Conclusion

Full component generation from design files remains, in my experience, more trouble than it is worth. But the layer underneath the components - the actual design decisions - is perfectly suited for a single, tech-stack-neutral source of truth. Design tokens provide the format, Style Dictionary provides the generation, and even a small UI like qcontroller's benefits tremendously: consistent styling, an honest collaboration boundary between design and code, and features like dark mode that fall out of the architecture almost for free.

If your project has the same color defined in more than one place, that is the signal. Extract it into tokens, and let the generator do the repeating for you.
