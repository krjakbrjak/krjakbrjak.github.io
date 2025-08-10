---
layout: post
title:  "Offscreen Rendering"
date:   2024-03-13
categories: qt opengl graphics c++ rendering
tags:
- qt
- opengl
- offscreen rendering
- c++
---

Off-screen rendering (rendering to a texture) is a crucial technique in computer graphics and game development. It allows you to render scenes or objects without displaying them directly on the screen, enabling advanced effects and flexible rendering pipelines.

**Prerequisites:**
- A working C++ development environment
- Qt 6
- Docker (to run inside a container)

## Why Offscreen Rendering?

**Common use cases:**
1. Post-processing effects: Apply effects like blur by rendering the scene into a texture and manipulating it before display.
2. Multiple render targets: Render into several textures at once (e.g., deferred rendering).
3. Custom shader effects: Use offscreen buffers for advanced shader operations.
4. Off-screen computation: Perform calculations that don’t need immediate display.

Off-screen rendering is essential for advanced graphics techniques and visual effects. It gives you flexibility and control over the rendering pipeline.

In this post, I’ll show how to achieve offscreen rendering using the Qt framework (Qt 6.6). Here are the main steps:

### Create an OpenGL context and make it current for the offscreen surface
This sets up the environment for rendering without a visible window.

```c++
QSurfaceFormat format;
format.setMajorVersion(4);
format.setMinorVersion(6);
if (QOpenGLContext::openGLModuleType() == QOpenGLContext::LibGL) {
    format.setRenderableType(QSurfaceFormat::OpenGL);
} else {
    format.setRenderableType(QSurfaceFormat::OpenGLES);
}

QOpenGLContext gl_ctx;
gl_ctx.setFormat(format);
gl_ctx.create();
if (!gl_ctx.isValid()) {
return 1;
}

QOffscreenSurface surface;
surface.setFormat(format);
surface.create();
if (!surface.isValid()) {
    return 1;
}

gl_ctx.makeCurrent(&surface);
```

### Create a custom Qt Quick window with a render control
This window will render the Qt Quick scenegraph into an offscreen target.

```c++
QQuickRenderControl control;
QQuickWindow window{&control};
window.setGraphicsDevice(QQuickGraphicsDevice::fromOpenGLContext(&gl_ctx));

if (!control.initialize()) {
    qDebug() << "Failed to initialize QQuickRenderControl";
    return 0;
}

// A custom framebuffer for rendering.
QOpenGLFramebufferObject fb{fb_size,
                            QOpenGLFramebufferObject::CombinedDepthStencil};

// Set the custom framebuffer's texture as the render target for the
// Qt Quick window.
auto tg = QQuickRenderTarget::fromOpenGLTexture(fb.texture(), fb.size());
window.setRenderTarget(tg);
```

This allows you to render the Qt Quick scene into a texture for further processing.

### Install a slot to react to scene changes
This ensures your rendering logic runs whenever the scene updates.
```c++
QObject::connect(
    &control, &QQuickRenderControl::sceneChanged, &control,
    [&] {
    control.polishItems();
    control.beginFrame();
    control.sync();
    control.render();
    control.endFrame();

    // Do any necessary processing on the framebuffer.
    },
    Qt::QueuedConnection);
```

### Load a custom QML item and reparent it to the custom window
This step attaches your QML content to the offscreen window for rendering.
```c++
QObject::connect(&component, &QQmlComponent::statusChanged, [&] {
QObject *rootObject = component.create();
if (component.isError()) {
    QList<QQmlError> errorList = component.errors();
    foreach (const QQmlError &error, errorList)
    qWarning() << error.url() << error.line() << error;
    return;
}
auto rootItem = qobject_cast<QQuickItem *>(rootObject);
if (!rootItem) {
    qWarning("Not a QQuickItem");
    delete rootObject;
    return;
}

rootItem->setParentItem(window.contentItem());
});

// Load qml.
component.loadUrl(QUrl::fromLocalFile("main.qml"));
```

## Common Pitfalls and Platform Notes
- Make sure your OpenGL context matches the requirements of your platform and Qt version.
- Some features may differ between OpenGL and OpenGLES.
- Qt version quirks: Always check the documentation for your Qt version.

## Summary
Offscreen rendering with Qt and OpenGL lets you implement advanced graphics techniques, post-processing, and flexible rendering pipelines. With the steps above, you can render Qt Quick scenes to textures and process them as needed.

For a complete working example, check [this GitHub repo](https://github.com/krjakbrjak/offscreen_rendering). I hope it helps anyone interested in offscreen rendering with Qt!
