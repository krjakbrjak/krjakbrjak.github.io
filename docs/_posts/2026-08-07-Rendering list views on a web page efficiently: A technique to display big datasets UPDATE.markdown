---
layout: post
title: "Rendering list views on a web page efficiently: A technique to display big datasets UPDATE"
description: "The scrollbar in the original post sits on top of the rows and takes every pointer event. Putting the rows inside the scroll container instead removed three mechanisms."
date: 2026-08-07
categories:
- frontend
- performance
tags:
- virtual scrolling
- react
- accessibility
- frontend
- css
---

In an earlier post I described [virtual scrolling](/web-development/frontend/performance/2024/01/06/Rendering-list-views-on-a-web-page-efficiently-A-technique-to-display-big-datasets.html) and the trick I used to get a scrollbar for a collection the browser never renders. I have now replaced the central part of that design. This is what was wrong with it.

## TL;DR

- The scrollbar came from an element layered **on top of** the rows, so it took every pointer event.
- Buttons inside rows could not be clicked, text could not be selected, and the row under the cursor had to be worked out from coordinates.
- Putting the rows **inside** the scroll container fixes all of it. The browser scrolls, the rows get their events.
- The arithmetic is the same. The browser now does the part I was doing by hand.

## The original design

Two boxes, one over the other:

```html
<div class="wrapper">
    <div class="content">
        <!-- the ten visible rows -->
    </div>
    <div class="scrolldiv">
        <div></div>
    </div>
</div>
```

`scrolldiv` sits over `content` and holds one empty child as tall as the whole collection. The scrollbar is real, because something really does overflow. It just happens to be empty. Its `onScroll` gives a position in whole-collection coordinates, and the component renders the rows starting there.

`content` is `overflow: hidden`, but it still gets a scroll position of its own:

```js
content.scrollTop = scrollTop % itemHeight;
```

Without that the list steps a row at a time. With a row height of 45 and a scroll position of 1000, the integer part picks the rows (row 22 onwards) and the remainder pushes them up by 10 pixels, which is what makes it look continuous.

## What it costs

The overlay must be on top and cover everything, or the wheel and the scrollbar drag never reach it. So does everything else a pointer does:

- A button inside a row cannot be clicked. `elementFromPoint` at the button returns the overlay.
- Dragging across a row selects no text.
- Hover has to be inferred: take `clientY`, subtract the container's position, divide by the row height, add the offset.
- A click has to be forwarded by hand. The component synthesises one on the row's first element, which carries no coordinates, so it lands in the same place wherever you clicked and never reaches anything nested.

There is an accessibility bill too. The handlers live on a bare `div`, which is what `jsx-a11y` was complaining about, and selection cannot be reached from a keyboard. Rows below the visible area are still tab stops, so focus walks into rows you cannot see, and nothing scrolls them into view because the scrolling belongs to the other element.

I did not notice any of this for a long time, for a dull reason: nothing in the demo rows was interactive.

## The same arithmetic, arranged differently

```html
<div class="scroller">
    <div class="spacer">
        <div class="window">
            <!-- the ten visible rows -->
        </div>
    </div>
</div>
```

```css
.scroller {
    overflow-y: auto;
    height: 100%;
}
.spacer {
    position: relative;
    height: /* totalCount * itemHeight */;
}
.window {
    position: absolute;
    top: 0;
    transform: /* translateY(offset * itemHeight) */;
}
```

The spacer is the same empty element as before and still the reason a scrollbar exists. The rows are now inside the thing that scrolls instead of underneath it.

Take a scroll position of 1000 again. The offset is 22, so the window is translated to 990, and the container is scrolled to 1000. The window therefore begins 10 pixels above the top edge, and the first row is clipped by exactly the amount you would expect after scrolling 22 rows and a bit. Those are the same 10 pixels as before, but now they are the difference between two positions rather than something I calculate.

The window moves once per row crossed. Anywhere between 1000 and 1034 it stays at 990 and the markup is identical, so the browser is scrolling a box and the rows slide with it. At 1035 the offset becomes 23: the window jumps forward one row and the rendered rows shift back one row at the same moment, and the two cancel, so nothing appears to move.

## What went away

The coordinate arithmetic, the synthetic click, the `scrollTop % itemHeight`, the measurement of the scrollbar width, and the extra clipped container. Hover and click are plain handlers on a row that knows its own index. Sixty lines lighter.

Both accessibility warnings went with them. They were never about ARIA; the linter was pointing at a click handler on a bare `div`. On a `tr` there is nothing to complain about, and `role="row"` is redundant enough that it gets rejected. Focus behaves too, since it now lands inside the scrolling element and the browser brings it into view on its own.

## The trade

The rows used to stay put and only their contents changed. Now the window moves, which is why it is a `transform` and not a `top`.

The subtler one caught me out. Rows were keyed by their position in the visible window, which is fine for a fixed slot with changing contents. Once the rows are real elements that move, the key has to be the absolute index, otherwise React gives a row's state to a different item as you scroll, and an input or a transition inside a row follows the slot instead of the data.

## Conclusion

The overlay was not thought through. It answered the question I had in front of me, how to get a scrollbar for rows that do not exist, and I stopped there. As an illustration of the idea it was fine. It failed as soon as the rows had to do anything: a link, a button, a value someone wants to copy. For a table that is not an edge case.

The change is in [virtualtable](https://github.com/krjakbrjak/virtualtable).
