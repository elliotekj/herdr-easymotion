# Herdr EasyMotion

Jump directly between visible panes in the active [Herdr](https://github.com/ogulcancelik/herdr) tab with large numbered pane hints.

Herdr EasyMotion reads the current tab layout, shows every visible pane as a numbered badge, and focuses the pane you pick. It is intended for layouts where moving pane-to-pane directionally is slower than naming the destination.

![Herdr EasyMotion pane hints demo](assets/herdr-easymotion-pane-hints.png)

## Requirements

Herdr 0.7.4 or newer. The picker draws into a full-size plugin popup, which is unavailable before 0.7.4; the retired `pane.graphics.*` API is not used, so the plugin also works on current Herdr.

## Installation

Install the plugin:

```bash
herdr plugin install elliotekj/herdr-easymotion
```

No additional configuration is required.

## Usage

Invoke the plugin action directly:

```bash
herdr plugin action invoke com.elliotekj.herdr-easymotion.pane
```

Or add a keybinding to your Herdr config, for example:

```toml
[[keys.command]]
key = "prefix+e"
type = "plugin_action"
command = "com.elliotekj.herdr-easymotion.pane"
description = "select pane"
```

The picker then covers the tab with a blueprint of the layout: each pane drawn as an outlined region at its real position, with a colored number centered inside it. Press that key to focus the pane, or `Esc`, `Ctrl+C` or `q` to cancel and leave focus where it was.

Hints target panes in the active tab layout. If the tab is zoomed, Herdr only exposes the zoomed pane as visible, so there is no alternate pane to jump to.

## How it renders

Herdr 0.9.2 removed the Herdr-specific pane graphics API (`pane.graphics.*`), so the plugin no longer draws translucent number badges on top of other panes. Instead it opens a full-size popup, takes the pane rectangles from `pane.layout`, and draws them in its own terminal with ANSI cursor positioning and 24-bit colored blocks.

The consequence is that the hints are not see-through: the popup is an opaque surface covering the tab for the moment you are choosing. The number→pane mapping and exact pane positions are preserved, which is what makes the jump reliable.

## License

[`Herdr EasyMotion`](LICENSE) is released under the Apache License 2.0.

## About

This plugin was written by Elliot Jackson.

* Blog: https://elliotekj.com
* Email: elliot@elliotekj.com
