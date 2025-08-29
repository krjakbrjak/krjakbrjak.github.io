---
layout: post
title:  "Rendering list views on a web page efficiently: A technique to display big datasets"
date:   2024-01-06
categories: web-development frontend performance
tags:
- virtual scrolling
- large datasets
- performance
- typescript
- react
---

Recently, I needed to implement a web widget that displays a collection of items. In some cases, the collection happened to have 7 million items. Of course, adding 7 million divs would hang the browser. I started searching for existing solutions on the web. There were some implementations available, but they seemed to be heavy, bringing in unnecessary dependencies. Plus, I was just curious to try to implement it. That is why this post.

This article describes the concept of <strong>virtual scrolling</strong>—a technique for efficiently rendering large lists in web applications. If you’ve ever needed to display thousands or millions of items, this approach will help keep your app fast and responsive.

## Efficiently Displaying Large Collections on the Web

Displaying a large collection of items on a web page can be challenging. If you try to render millions of elements (like `<div>`s), the browser will slow down or even crash. While there are libraries to help, many add unnecessary complexity or dependencies.

Most frameworks let you display lists of items easily. For example, in C++ with Qt, you use [QAbstractItemModel](https://doc.qt.io/qt-6/qabstractitemmodel.html) for your data and [QAbstractItemView](https://doc.qt.io/qt-6/qabstractitemview.html) for rendering. The key is to render only what's visible, especially with large datasets. Other languages and frameworks offer similar solutions.

On the web, infinite scrolling and pagination are common. These work well for social feeds or online shops, where users scroll until they find what they want. But sometimes, you have a sorted dataset and users want to jump to a specific item quickly. In these cases, a scrollbar that accurately reflects the dataset size is important.

## Basic Scrolling Example

A simple way to add scrolling is to limit the container's height and set its `overflow` property:

```html
<div class="scrolldiv">
    <!-- items here -->
</div>
```

```css
.scrolldiv {
    overflow: auto;
    height: 400px; /* set to desired height */
}
```

This creates a scrollbar, but it's inefficient for large datasets because all items are rendered and stored in memory.

## Efficient Rendering: Virtual Scrolling

To improve performance, only render the items that fit on the screen (plus a few extra for smooth scrolling). As the user scrolls, update which items are displayed based on the scroll position.

This requires two things:
1. **A data source** that can fetch items at a specific offset.
2. **Custom scrollbar logic** so the scrollbar matches the full dataset, even though only a few items are rendered.

### Data Source Interface

Here's a TypeScript interface for fetching data:

```typescript
interface Result<Type> {
    from: number;
    items: Array<Type>;
    totalCount: number;
}

export interface DataSource<T> {
    fetch(index: number, count: number): Promise<Result<T>>;
}
```

### Scrollbar Implementation

To create a scrollbar that represents the entire dataset, use two overlapping elements:
- `content`: displays the visible items.
- `scrolldiv`: provides the scrollbar, sized to the full dataset.

The `scrolldiv` contains an empty child with a height equal to the total number of items times the height of one item. This tricks the browser into showing a scrollbar of the correct size.

```html
<div class="wrapper">
    <div class="content">
        <!-- visible items here -->
    </div>
    <div class="scrolldiv">
        <div></div>
    </div>
</div>
```

```css
.wrapper {
    position: relative;
}
.content {
    overflow: hidden;
    height: 100%;
    width: 100%;
}
.scrolldiv {
    position: absolute;
    overflow: scroll;
    top: 0;
    left: 0;
    bottom: 0;
    height: 100%;
    width: 100%;
}
.scrolldiv > div {
    height: /* totalCount * itemHeight */;
    width: 100%;
}
```

<br>
<strong>Accessibility:</strong> When implementing virtual scrolling, consider keyboard navigation and screen reader support. Ensure that focus management and ARIA roles are handled so all users can interact with your list.

<strong>Edge Cases:</strong> If your items have variable heights or the dataset changes dynamically, you may need to adjust your logic to handle these scenarios efficiently.

<strong>Performance:</strong> Virtual scrolling can dramatically reduce memory usage and improve render times. For example, rendering only 50 items instead of 7 million keeps your app responsive and avoids browser crashes.

One can check my simple [implementation](https://github.com/krjakbrjak/virtualtable/tree/master) of this list view idea using [React](https://react.dev/). If you want to see a live demo, check the <a href="https://krjakbrjak.github.io/virtualtable/">virtualtable demo</a>.

## Summary
Virtual scrolling lets you efficiently display large datasets by only rendering visible items and using a custom scrollbar to represent the entire collection. This approach keeps your app fast and responsive, even with millions of items.

I invite you all to share your thoughts, feedback, or experiences related to handling large datasets in web applications. Have you tried similar or different approaches?
