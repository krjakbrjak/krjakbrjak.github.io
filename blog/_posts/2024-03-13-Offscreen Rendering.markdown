---
layout: post
title:  "Offscreen Rendering"
date:   2024-03-13
categories: jekyll update
---

Off-screen rendering or rendering to a texture, plays a crucial role in numerous scenarios within computer graphics and game development:

1. Post-processing Effects: Custom framebuffers are frequently employed to apply post-processing effects such as blur. These effects necessitate rendering the scene into a texture for further manipulation before displaying it on the screen.

2. Multiple Render Targets: There are instances where it becomes necessary to render into multiple textures simultaneously. This technique, known as Multiple Render Targets, is commonly utilized for effects like deferred rendering.

3. Custom Shader Effects.

4. Off-screen Computation: This involves computations that do not require immediate display on the screen.

Overall, off-screen rendering is important for implementing a variety of advanced rendering techniques and achieving visual effects that surpass basic rendering directly onto the screen. It offers flexibility and control over the rendering pipeline, allowing developers to create visually captivating graphics.

In this post, I aim to demonstrate how this can be effortlessly achieved using the Qt framework. The subsequent example is based on Qt version 6.6. The fundamental steps to achieve off-screen rendering can be outlined as follows:

* Create an OpenGL context and make it current in the current thread, against the off-screen surface.

    ```c++
    QSurfaceFormat format;
    format.setMajorVersion(4);
    format.setMinorVersion(6);

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
* Create a custom qt quick window with a render control, that will be used for rendering the Qt Quick scenegraph into an offscreen target. 

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
* Install a slot for reacting to the changes in the scene:
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
* Load a custom QML item and reparent it to a custom quick window created earlier:
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

For the whole working example check [this github repo](https://github.com/krjakbrjak/offscreen_rendering). I hope it is helpful to someone who is wondering how it can be achieved.
