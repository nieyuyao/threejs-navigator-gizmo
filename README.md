
# 3D Navigator Gizmo

![npm](https://img.shields.io/npm/v/threejs-navigator-gizmo.svg)

A 3D navigator gizmo addon for ThreeJS. It has features of both `TrackballControls` and `ViewHelper`. It does not lock the camera to the direction vertical to up when the camera is moved to the direction parallel to up.

<img src="https://img2.imgtp.com/2024/04/29/4isQzQNQ.png" width=160>
<img src="https://img2.imgtp.com/2024/04/29/XWMpJlbF.png" width=160>

# Install

```
npm i threejs-navigator-gizmo
```

# Usage

```javascript
const navigator = new NavigatorGizmo(camera, renderer, { ... })

...
const render = () => {
	renderer.render(scene, camera)
	navigator.update()
}

...
```

# Options

| Property | Description | Type | DefaultValue|
| --- | --- | --- | -- |
| size |  Viewport size of gizmo | `number` | `200` |
| rotateSpeed | Rotation speed | `number` | `1` |
| paddingX | Horizontal distance from the left edge of canvas | `number` | `0` |
| paddingY | Horizontal distance from the bottom edge of canvas | `number` | `0` |
| navigatorBgColor | Color of circular background of navigator  | `number` | `0xffffff` |
| navigatorBgOpacity | Opacity of circular background of navigator | `number` | `0.2` |
| pinterLockMode | Whether to enable pointer lock mode. Mouse pointer will be hidden when dragging will if enabled |  `boolean` | `false` |
| trackballTextColor | Text color of trackball | `number` | `0x000000` |
| trackballTextHoverColor | Text color of trackball if hover | `number` | `0xffffff` |
| trackballBgImage | Background image of trackball. | `HTMLImageElement` | - |
| axesColor | Colours of xyz axes | `number[]` | `[0xff5453, 0x8adb00, 0x2c8fff]` |
| trackballFillColors | Fill Colours of six trackballs. The elements represent x, y, z, negX(Negative X), negY(Negative Y), negZ(Negative Z) | `number[]` | `[0xff3653, 0x8adb00, 0x2c8fff, 0x61363c, 0x485b2e, 0x354860]` |
| trackballStrokeColors | Stroke Colours of six trackballs. The elements represent x, y, z, negX(Negative X), negY(Negative Y), negZ(Negative Z)| `number[]` | `[0xffffff, 0xffffff, 0xffffff, 0xff3653, 0x8adb00, 0xff3653]` |
| standalone | Create one standalone canvas to render gizmo | `boolean` | `false` |
| clearColor | Sets clear color. Only works if standalone is enabled | number | - |
| clearAlpha | Sets clear alpha. Ranges from 0 to 1. Only works if standalone is enabled | number | - |
