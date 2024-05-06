import {
	WebGLRenderer,
	Object3D,
	OrthographicCamera,
	SpriteMaterial,
	Sprite,
	CanvasTexture,
	Vector3,
	Scene,
	EventDispatcher,
	Vector4,
	MeshBasicMaterial,
	Mesh,
	Raycaster,
	Vector2,
	Quaternion,
	PerspectiveCamera,
	CylinderGeometry,
	ShaderMaterial,
	DoubleSide,
	BufferGeometry,
	Color,
	Float32BufferAttribute,
	Euler,
} from 'three'

export interface Options {
	// viewport size of gizmo
	size: number
	// background image of trackball
	trackballBgImage?: HTMLImageElement
	// text color of trackball
	trackballTextColor: number
	// text color if hover of trackball
	trackballTextHoverColor: number
	// horizontal distance from the left edge of canvas
	paddingX: number
	// vertical distance from the bottom edge of canvas
	paddingY: number
	// background color of gizmo
	navigatorBgColor: number
	// background opacity of gizmo
	navigatorBgOpacity: number
	// Whether to enable pointer lock mode
	pinterLockMode: boolean
	// rotate speed
	rotateSpeed: number
	// color of xyz axes
	axesColor: number[]
	// Fill Colours of six trackballs.
	// The elements represent x, y, z, negX(Negative X), negY(Negative Y), negZ(Negative Z)
	trackballFillColors: number[]
	// Stoke Colours of six trackballs.
	// The elements represent x, y, z, negX(Negative X), negY(Negative Y), negZ(Negative Z)
	trackballStrokeColors: number[]
	// create a standalone canvas to render gizmo
	standalone: boolean
}

const DEFAULT_OPTIONS: Options = {
	size: 200,
	trackballTextColor: 0x000000,
	trackballTextHoverColor: 0xffffff,
	paddingX: 0,
	paddingY: 0,
	navigatorBgColor: 0xffffff,
	navigatorBgOpacity: 0.2,
	pinterLockMode: false,
	rotateSpeed: 1,
	axesColor: [0xff5453, 0x8adb00, 0x2c8fff],
	trackballFillColors: [
		0xff3653, // x
		0x8adb00, // y
		0x2c8fff, // z,
		0x61363c, // negX
		0x485b2e, // negY
		0x354860, // negZ
	],
	trackballStrokeColors: [
		0xffffff, // x
		0xffffff, // y
		0xffffff, // z,
		0xff3653, // negX
		0x8adb00, // negX
		0x2c8fff, // negZ
	],
	standalone: false,
}

const TWO_PI = 2 * Math.PI

const EPSILON = 0.0001

interface AxisBallOptions {
	bg?: HTMLImageElement
	name: string
	// fillColor
	fill: string
	// stroke color
	stroke: string
	// trackball text
	text: string
	// trackball text color
	textColor: string
	// direction vector
	direction: Vector3
	// up of camera
	up: Vector3
	canvas: HTMLCanvasElement
	// quaternion of target position
	targetQuat: Quaternion
}

interface AnimationData {
	// last timestamp
	last: number
	// rotate angle of up
	upRotateAngle: number
	// rotate axis of up
	upRotateAxis: Vector3
	// target up
	targetUp: Vector3
	// position quaternion
	targetQuat: Quaternion
}

// Gets NDC Coords
const getNdcCoords = (mousePosition: Vector2, width: number, height: number): Vector2 => {
	const p = new Vector2(1, 1)
	p.x = (2 * mousePosition.x) / width - 1
	p.y = 1 - (2 * mousePosition.y) / height
	return p
}

const getClientNormalCoords = (mousePosition: Vector2, width: number, height: number): Vector2 => {
	const p = new Vector2(1, 1)
	p.x = mousePosition.x / width
	p.y = 1 - mousePosition.y / height
	return p
}

const createCanvas = () => {
	const canvas = document.createElement('canvas')
	canvas.width = 180
	canvas.height = 180
	return canvas
}

export class NavigatorGizmo extends EventDispatcher {
	public readonly name = 'NavigatorGizmo'

	private object: PerspectiveCamera | OrthographicCamera

	private renderer: WebGLRenderer

	private orthCamera: OrthographicCamera

	private scene: Scene

	private orthCameraWidth = 2

	private rayCaster = new Raycaster()

	private animating = false

	private drag = false

	private lastMouseCoords = new Vector2()

	private curMouseCoords = new Vector2()

	private moveDirection = new Vector3()

	private alreadyMousedown = false

	private rotateAxis = new Vector3()

	private targetPosition = new Vector3()

	private target: Object3D

	private disc: Mesh

	private objectRadian = 0

	private options: Options

	private mousePosition = new Vector2()

	private mouseDownPosition = new Vector2()

	private isPointerLocked = false

	private supportPointerLock = false

	private animationData: AnimationData = {
		last: 0,
		targetUp: new Vector3(),
		upRotateAngle: 0,
		upRotateAxis: new Vector3(),
		targetQuat: new Quaternion(),
	}

	/**
	 * [minX, maxX, minY, maxY]
	 *
	 * 	   minX         maxX
	 * minY -|------------|-
	 *       |            |
	 * 		   |            |
	 * maxY -|------------|-
	 */
	private discBounding: [number, number, number, number] = [0, 0, 0, 0]

	private hovered: Sprite | null = null

	private scopeRenderer: WebGLRenderer

	constructor(
		object: PerspectiveCamera | OrthographicCamera,
		renderer: WebGLRenderer,
		options?: Partial<Options>
	) {
		super()
		this.options = { ...DEFAULT_OPTIONS, ...(options ? options : {}) }
		this.object = object
		this.renderer = renderer
		this.scene = new Scene()
		this.createOrthCamera()
		this.createDisc()
		this.createAxes()
		this.createTrackBalls()
		this.objectRadian = object.position.sub(this.targetPosition).length()
		this.supportPointerLock = typeof this.renderer.domElement.requestPointerLock === 'function'

		if (this.options.standalone) {
			// create renderer
			const scopeCanvas = createCanvas()

			scopeCanvas.width = this.options.size
			scopeCanvas.height = this.options.size
			this.scopeRenderer = new WebGLRenderer({ canvas: scopeCanvas })
			this.scopeRenderer.setPixelRatio(window.devicePixelRatio)
			renderer.domElement.parentElement?.appendChild(scopeCanvas)

			scopeCanvas.style.cssText = `
				position: absolute;
				left: ${this.options.paddingX}px;
				bottom: ${this.options.paddingY}px;
				width: ${this.options.size}px;
				height: ${this.options.size}px;
			`
		}
		this.bindEventListener()
	}

	setTarget(target: Object3D) {
		this.target = target
		this.targetPosition = target.position.clone()
		this.objectRadian = this.object.position.sub(this.targetPosition).length()
	}

	getTarget() {
		return this.target
	}

	private createOrthCamera() {
		this.orthCamera = new OrthographicCamera(
			-this.orthCameraWidth,
			this.orthCameraWidth,
			this.orthCameraWidth,
			-this.orthCameraWidth,
			-2
		)
		this.orthCamera.position.set(0, 0, 10)
	}

	private renderTrackBall(canvas: HTMLCanvasElement, options: AxisBallOptions) {
		const ctx = canvas.getContext('2d')
		if (!ctx) {
			return
		}
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		const r = canvas.width / 2
		if (options.bg) {
			ctx.drawImage(options.bg, 0, 0, canvas.width, canvas.height)
		} else {
			if (options.fill) {
				ctx.beginPath()
				ctx.arc(r, r, r, 0, TWO_PI)
				ctx.fillStyle = options.fill
				ctx.closePath()
				ctx.fill()
			}
			if (options.stroke) {
				ctx.beginPath()
				ctx.arc(r, r, r - 10, 0, TWO_PI)
				ctx.closePath()
				ctx.strokeStyle = options.stroke
				ctx.lineWidth = 10
				ctx.stroke()
			}
		}
		if (options.text) {
			// draw text
			ctx.fillStyle = options.textColor
			ctx.font = 'bold 96px Arial'
			ctx.textAlign = 'center'
			ctx.textBaseline = 'middle'
			ctx.fillText(options.text, r, r)
		}

		const mat = new SpriteMaterial({
			map: new CanvasTexture(canvas),
		})

		return mat
	}

	private getOppositeTrackBall(name: string) {
		return this.scene.getObjectByName(
			name.includes('-')
				? `OrthGizmoControlAxisBall${name.slice(1)}`
				: `OrthGizmoControlAxisBall-${name}`
		)
	}

	private createTrackBall(options: AxisBallOptions) {
		const { canvas } = options
		const mat = this.renderTrackBall(canvas, options)
		const ball = new Sprite(mat)
		ball.userData.options = options
		ball.position.copy(options.direction.clone().multiplyScalar(1.2))
		ball.scale.set(0.6, 0.6, 1)
		ball.name = `OrthGizmoControlAxisBall${options.name}`
		this.scene.add(ball)
	}

	private createAxis(color: number) {
		const geo = new CylinderGeometry(0.02, 0.02, 0.9, 100, 100)
		const mat = new MeshBasicMaterial({ color })
		const axis = new Mesh(geo, mat)
		this.scene.add(axis)
		return axis
	}

	private createAxes() {
		const [xColor, yColor, zColor] = this.options.axesColor
		// X
		const x = this.createAxis(xColor)
		x.rotateZ(Math.PI / 2)
		x.translateY(-0.45)
		// Y
		const y = this.createAxis(yColor)
		y.translateY(0.45)
		// Z
		const z = this.createAxis(zColor)
		z.rotateX(Math.PI / 2)
		z.translateY(0.45)
	}

	private createTrackBalls() {
		const { options } = this
		const x = new Vector3(1, 0, 0)
		const y = new Vector3(0, 1, 0)
		const z = new Vector3(0, 0, 1)
		const negX = x.clone().multiplyScalar(-1)
		const negY = y.clone().multiplyScalar(-1)
		const negZ = z.clone().multiplyScalar(-1)
		const textColor = new Color().setHex(options.trackballTextColor).getStyle()
		const [xFillColor, yFillColor, zFillColor, negXFillColor, negYFillColor, negZFillColor] =
			options.trackballFillColors
		const [
			xStrokeColor,
			yStrokeColor,
			zStrokeColor,
			negXStrokeColor,
			negYStrokeColor,
			negZStrokeColor,
		] = options.trackballStrokeColors
		// X
		this.createTrackBall({
			name: 'X',
			fill: new Color().setHex(xFillColor).getStyle(),
			stroke: new Color().setHex(xStrokeColor).getStyle(),
			text: 'X',
			textColor,
			direction: x,
			up: y.clone(),
			targetQuat: new Quaternion().setFromEuler(new Euler(0, Math.PI * 0.5, 0)),
			canvas: createCanvas(),
			bg: options.trackballBgImage,
		})
		// -X
		this.createTrackBall({
			name: '-X',
			fill: new Color().setHex(negXFillColor).getStyle(),
			stroke: new Color().setHex(negXStrokeColor).getStyle(),
			text: '',
			textColor,
			direction: negX,
			up: y,
			targetQuat: new Quaternion().setFromEuler(new Euler(0, -Math.PI * 0.5, 0)),
			canvas: createCanvas(),
			bg: options.trackballBgImage,
		})
		// Y
		this.createTrackBall({
			name: 'Y',
			fill: new Color().setHex(yFillColor).getStyle(),
			stroke: new Color().setHex(yStrokeColor).getStyle(),
			text: 'Y',
			textColor,
			direction: y,
			up: negZ,
			targetQuat: new Quaternion().setFromEuler(new Euler(-Math.PI * 0.5, 0, 0)),
			canvas: createCanvas(),
			bg: options.trackballBgImage,
		})
		// -Y
		this.createTrackBall({
			name: '-Y',
			fill: new Color().setHex(negYFillColor).getStyle(),
			stroke: new Color().setHex(negYStrokeColor).getStyle(),
			text: '',
			textColor,
			direction: negY,
			up: z,
			targetQuat: new Quaternion().setFromEuler(new Euler(Math.PI * 0.5, 0, 0)),
			canvas: createCanvas(),
			bg: options.trackballBgImage,
		})
		// Z
		this.createTrackBall({
			name: 'Z',
			fill: new Color().setHex(zFillColor).getStyle(),
			stroke: new Color().setHex(zStrokeColor).getStyle(),
			text: 'Z',
			textColor,
			direction: z,
			up: y,
			targetQuat: new Quaternion(),
			canvas: createCanvas(),
			bg: options.trackballBgImage,
		})
		// -Z
		this.createTrackBall({
			name: '-Z',
			fill: new Color().setHex(negZFillColor).getStyle(),
			stroke: new Color().setHex(negZStrokeColor).getStyle(),
			text: '',
			textColor,
			direction: negZ,
			targetQuat: new Quaternion().setFromEuler(new Euler(0, Math.PI, 0)),
			up: y,
			canvas: createCanvas(),
			bg: options.trackballBgImage,
		})
	}

	private createDisc() {
		const geo = new BufferGeometry()
		geo.setAttribute(
			'position',
			new Float32BufferAttribute([1, 1, 0, -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0, -1, -1, 0], 3)
		)
		geo.setAttribute('uv', new Float32BufferAttribute([1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0], 2))
		const mat = new ShaderMaterial({
			transparent: true,
			side: DoubleSide,
			depthWrite: false,
			depthTest: false,
			uniforms: {
				color: { value: new Color().setHex(this.options.navigatorBgColor) },
				opacity: { value: this.options.navigatorBgOpacity },
			},
			vertexShader: `
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = vec4(position.xy, 1.0, 1.0);
				}
			`,
			fragmentShader: `
				varying vec2 vUv;
				uniform vec3 color;
				uniform float opacity;
				void main() {
					vec2 uv = vUv - vec2(0.5);
					gl_FragColor = step(1. / 0.36, 1. / length(uv)) * vec4(color, opacity);
				}
			`,
		})
		const disc = new Mesh(geo, mat)
		disc.name = 'OrthGizmoControlDisc'
		disc.visible = false
		this.scene.add(disc)
		this.disc = disc
		const size = this.options.size
		this.discBounding = [0.14 * size, 0.86 * size, 0.14 * size, 0.86 * size]
	}

	private mouseEnterBounding(mousePos: Vector2) {
		const { discBounding } = this
		return (
			(mousePos.x - discBounding[0]) * (discBounding[1] - mousePos.x) > 0 &&
			(mousePos.y - discBounding[2]) * (discBounding[3] - mousePos.y) > 0
		)
	}

	private findHoveredBall(mousePos: Vector2) {
		const coords = getNdcCoords(mousePos, this.options.size, this.options.size)
		const intersects = this.getIntersects(coords)
		return intersects.map((it) => it.object).find((obj) => obj instanceof Sprite)
	}

	private getMousePosition = (clientX: number, clientY: number, target: HTMLElement): Vector2 => {
		const br = (target as HTMLElement).getBoundingClientRect()
		const offsetX = this.options.standalone ? 0 : this.options.paddingX
		const offsetY = this.options.standalone ? 0 : this.options.paddingY
		return new Vector2(
			clientX - br.x - offsetX,
			clientY - br.y - (br.height - offsetY - this.options.size)
		)
	}

	private getIntersects(p: Vector2) {
		const { rayCaster, orthCamera, scene } = this
		rayCaster.setFromCamera(p, orthCamera)
		const intersects = rayCaster.intersectObjects(scene.children)
		return intersects
	}

	private handlePointerdown = (event: MouseEvent) => {
		const mousedownPosition = this.getMousePosition(
			event.clientX,
			event.clientY,
			event.target as HTMLElement
		)
		this.mousePosition.copy(mousedownPosition)
		this.mouseDownPosition.x = event.clientX
		this.mouseDownPosition.y = event.clientY
		if (this.animating) {
			return
		}
		this.drag = false
		if (this.mouseEnterBounding(mousedownPosition)) {
			this.disc.visible = true
			const mouseCoords = getClientNormalCoords(
				mousedownPosition,
				this.options.size,
				this.options.size
			)
			this.lastMouseCoords.copy(mouseCoords)
			this.alreadyMousedown = true
		}
	}

	private updateHovered(mousePosition: Vector2) {
		const hovered = this.findHoveredBall(mousePosition) as Sprite
		if (hovered) {
			if (hovered !== this.hovered) {
				this.onLeave()
				this.hovered = hovered
				this.handleHover(hovered)
			}
		} else {
			this.onLeave()
			this.hovered = null
		}
	}

	private handlePointermove = (event: MouseEvent) => {
		let mousemovePosition = this.getMousePosition(
			event.clientX,
			event.clientY,
			event.target as HTMLElement
		)
		this.mousePosition.copy(mousemovePosition)
		// determine whether to show disc
		this.disc.visible = this.mouseEnterBounding(mousemovePosition)
		// find ball which is hovered
		if (this.disc.visible) {
			this.updateHovered(mousemovePosition)
		}
		if (this.animating || !this.alreadyMousedown) {
			return
		}
		if (this.options.pinterLockMode && this.supportPointerLock) {
			const domElement = this.options.standalone ? this.scopeRenderer.domElement : this.renderer.domElement
			// wether pointer is locked
			if (document.pointerLockElement !== domElement) {
				domElement.requestPointerLock()
				this.isPointerLocked = true
			}
		}
		if (this.isPointerLocked) {
			this.mouseDownPosition.x += event.movementX
			this.mouseDownPosition.y += event.movementY
			mousemovePosition = this.getMousePosition(
				this.mouseDownPosition.x,
				this.mouseDownPosition.y,
				event.target as HTMLElement
			)
		}
		this.drag = true
		const size = this.options.size
		this.curMouseCoords.copy(getClientNormalCoords(mousemovePosition, size, size))
		const dx = this.curMouseCoords.x - this.lastMouseCoords.x
		const dy = this.curMouseCoords.y - this.lastMouseCoords.y
		this.handleDrag(dx, dy)
		this.lastMouseCoords.copy(this.curMouseCoords)
	}

	private handleDrag(dx: number, dy: number) {
		const { moveDirection, rotateAxis, object, targetPosition } = this
		const { rotateSpeed } = this.options
		moveDirection.set(dx, dy, 0)
		let angle = moveDirection.length()
		if (angle) {
			const yDir = new Vector3(0, 1, -1)
				.unproject(object)
				.sub(new Vector3(0, 0, -1).unproject(object))
				.normalize()
			const eyeDir = object.position.clone().sub(targetPosition).normalize()
			// Tangent Direction
			const tangentDir = new Vector3(1, 0, -1)
				.unproject(object)
				.sub(new Vector3(0, 0, -1).unproject(object))
				.normalize()
			const yMove = yDir.clone().multiplyScalar(dy)
			const tangentMove = tangentDir.multiplyScalar(dx)
			moveDirection.copy(yMove.add(tangentMove))
			// axis
			const axis = rotateAxis.crossVectors(moveDirection, eyeDir).normalize()
			angle *= rotateSpeed
			const quat = new Quaternion()
			quat.setFromAxisAngle(axis, angle)
			// update user camera
			object.position.sub(targetPosition).applyQuaternion(quat).add(targetPosition)
			object.up.copy(yDir)
			object.lookAt(targetPosition)
		}
	}

	private handlePointerup = (event: MouseEvent) => {
		if (this.isPointerLocked) {
			document.exitPointerLock()
			this.isPointerLocked = false
		}
		if (this.animating) {
			return
		}
		this.alreadyMousedown = false
		if (this.drag) {
			this.onLeave()
			this.drag = false
			return
		}
		// handle click event
		const mouseupPosition = this.getMousePosition(
			event.clientX,
			event.clientY,
			event.target as HTMLElement
		)
		const clicked = this.findHoveredBall(mouseupPosition) as Sprite
		if (!clicked) {
			return
		}
		let options = clicked.userData.options as AxisBallOptions
		if (clicked?.name?.startsWith('OrthGizmoControlAxisBall')) {
			// clicked track ball is same as last rotate to the opposite axis
			if (this.object.quaternion.angleTo(options.targetQuat) <= EPSILON) {
				const opposite = this.getOppositeTrackBall(options.name) as Sprite
				if (opposite) {
					options = opposite.userData.options as AxisBallOptions
				}
			}
			let { up, targetQuat } = options
			const curUp = this.orthCamera.up.clone()
			this.handleClick(curUp, up, targetQuat)
		}
	}

	private handleClick = (up: Vector3, targetUp: Vector3, targetQuat: Quaternion) => {
		this.animating = true
		this.prepareAnimationData(up, targetUp, targetQuat)
	}

	private prepareAnimationData = (up: Vector3, targetUp: Vector3, targetQuat: Quaternion) => {
		const { animationData } = this
		animationData.last = Date.now()
		// multiplying 1000 to reduce error
		animationData.upRotateAngle = Math.acos(up.dot(targetUp))
		animationData.upRotateAxis.crossVectors(up.multiplyScalar(1000), targetUp).normalize()
		animationData.targetUp.copy(targetUp)
		animationData.targetQuat = targetQuat
	}

	private clampStep(step: number, tail: number) {
		return tail - step <= 0 ? tail : step
	}

	private animate(now: number) {
		const { animationData, object, objectRadian, mousePosition } = this
		const { upRotateAxis, targetUp, targetQuat } = animationData
		const delta = now - animationData.last
		const step = (delta * TWO_PI) / 1000
		const upStep = this.clampStep(step, animationData.upRotateAngle)
		animationData.upRotateAngle -= upStep
		object.quaternion.rotateTowards(targetQuat, step)
		object.position.set(0, 0, 1).applyQuaternion(object.quaternion).multiplyScalar(objectRadian)
		// update user camera
		if (upStep > 0) {
			object.up.applyAxisAngle(upRotateAxis, upStep).normalize()
		}
		animationData.last = now
		if (object.quaternion.angleTo(targetQuat) === 0 && animationData.upRotateAngle === 0) {
			//
			this.animating = false
			object.up.copy(targetUp)
			if (this.mouseEnterBounding(mousePosition)) {
				this.updateHovered(mousePosition)
			}
		}
	}

	private handleHover(ball: Sprite) {
		const options = ball.userData.options as AxisBallOptions
		const { canvas, name } = options
		if (name.startsWith('-')) {
			options.text = name
		}
		options.textColor = new Color().setHex(this.options.trackballTextHoverColor).getStyle()
		// @ts-ignore
		ball.material = this.renderTrackBall(canvas, options)
	}

	private onLeave() {
		const ball = this.hovered
		if (!ball) {
			return
		}
		const options = ball.userData.options as AxisBallOptions
		const { canvas, name } = options
		if (name.startsWith('-')) {
			options.text = ''
			options.textColor = ''
		} else {
			options.textColor = new Color().setHex(this.options.trackballTextColor).getStyle()
		}
		// @ts-ignore
		ball.material = this.renderTrackBall(canvas, options)
	}

	private bindEventListener() {
		const { renderer, options } = this
		const domElement = options.standalone ? this.scopeRenderer.domElement : renderer.domElement
		domElement.addEventListener('pointerdown', this.handlePointerdown)
		domElement.addEventListener('pointermove', this.handlePointermove)
		domElement.addEventListener('pointerup', this.handlePointerup)
		domElement.addEventListener('pointerleave', this.handlePointerup)
	}

	private unbindEventListener() {
		const { renderer, options } = this
		const domElement = options.standalone ? this.scopeRenderer.domElement : renderer.domElement
		domElement.removeEventListener('pointerdown', this.handlePointerdown)
		domElement.removeEventListener('pointermove', this.handlePointermove)
		domElement.removeEventListener('pointerup', this.handlePointerup)
		domElement.removeEventListener('pointerleave', this.handlePointerup)
	}

	private syncOrthCamera() {
		const { orthCamera, object } = this
		orthCamera.quaternion.copy(object.quaternion)
		orthCamera.position.set(0, 0, 1).applyQuaternion(object.quaternion).multiplyScalar(10)
		orthCamera.up.copy(object.up)
	}

	private render(renderer: WebGLRenderer) {
		if (this.animating) {
			const now = Date.now()
			this.animate(now)
		}
		this.syncOrthCamera()
		renderer.render(this.scene, this.orthCamera)
	}

	update() {
		const { renderer, options, scopeRenderer } = this
		if (options.standalone) {
			this.render(scopeRenderer)
		} else {
			const userViewport = renderer.getViewport(new Vector4())
			const vp = new Vector4(options.paddingX, options.paddingY, options.size, options.size)
			renderer.setViewport(vp)
			// To allow render overlay
			const userAutoClearSetting = renderer.autoClear
			renderer.autoClear = false
			renderer.clearDepth()
			this.render(renderer)
			// restore
			renderer.autoClear = userAutoClearSetting
			renderer.setViewport(userViewport)
		}
	}

	dispose() {
		this.scene.traverse((ch) => {
			if (ch instanceof Mesh) {
				ch.geometry.dispose()
				ch.material.dispose()
			}
		})
		this.scene.clear()
		this.unbindEventListener()
		if (this.scopeRenderer) {
			this.scopeRenderer.domElement.parentElement?.removeChild(this.scopeRenderer.domElement)
		}
	}
}
