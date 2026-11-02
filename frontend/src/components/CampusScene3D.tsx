/**
 * Schematic 3D campus massing built from the dataset's own `building.map`
 * boxes. Nothing here invents geography: footprints come from the persisted
 * campus model, heights come from each building's stored floor count and one
 * clearly-labelled storey-height assumption, and every movement arc is the
 * same Phase 3 transition the 2D plan draws.
 *
 * The scene is deliberately "schematic massing", not an architectural model:
 * there are no windows, roofs or facade details, because the dataset carries
 * none. Labels above the blocks state that.
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { MovementTransition } from '../lib/types'

export interface SceneBuilding {
  id: string
  code: string
  name: string
  zone: string
  floors: number
  map: { x: number; y: number; w: number; h: number }
  accent: string
}

type Tone = 'feasible' | 'tight' | 'unknown' | 'infeasible'

interface SceneRoute {
  key: string
  fromId: string
  toId: string
  students: number
  tone: Tone
  transitions: MovementTransition[]
}

const TONE_COLOURS: Record<Tone, number> = {
  feasible: 0x38d9f5,
  tight: 0xf2b23e,
  unknown: 0x8b9bb4,
  infeasible: 0xff5d73,
}

const TONE_RANK: Record<Tone, number> = { feasible: 0, tight: 1, unknown: 2, infeasible: 3 }

/** SVG plan units per world unit (the plan is 1000 × 640 units). */
const SCALE = 10
/** Assumed storey height in world units — an explicit assumption, not data. */
const STOREY = 4.4

function cssColour(name: string, fallback: string): THREE.Color {
  if (typeof window === 'undefined') return new THREE.Color(fallback)
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const parts = raw.split(/\s+/).map(Number)
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) return new THREE.Color(fallback)
  return new THREE.Color(parts[0] / 255, parts[1] / 255, parts[2] / 255)
}

function centreOf(building: SceneBuilding) {
  return {
    x: (building.map.x + building.map.w / 2 - 500) / SCALE,
    z: (building.map.y + building.map.h / 2 - 320) / SCALE,
  }
}

function sizeOf(building: SceneBuilding) {
  return {
    w: building.map.w / SCALE,
    d: building.map.h / SCALE,
    h: Math.max(1.8, building.floors * STOREY),
  }
}

/** Point on the footprint edge, marched toward another point (same maths as the 2D plan). */
function edgePoint(
  building: SceneBuilding,
  towardsX: number,
  towardsZ: number,
  padding: number,
): { x: number; z: number } {
  const centre = centreOf(building)
  const halfW = sizeOf(building).w / 2 + padding
  const halfD = sizeOf(building).d / 2 + padding
  const dx = towardsX - centre.x
  const dz = towardsZ - centre.z
  if (dx === 0 && dz === 0) return { x: centre.x, z: centre.z }
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : halfW / Math.abs(dx),
    dz === 0 ? Number.POSITIVE_INFINITY : halfD / Math.abs(dz),
  )
  return { x: centre.x + dx * scale, z: centre.z + dz * scale }
}

export function CampusScene3D({
  buildings,
  selected,
  onSelect,
  transitions,
  activeTransitionId,
  onTransitionSelect,
  showMovement,
}: {
  buildings: SceneBuilding[]
  selected: string | null
  onSelect: (id: string) => void
  transitions: MovementTransition[]
  activeTransitionId: string | null
  onTransitionSelect: (transition: MovementTransition) => void
  showMovement: boolean
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const labelsRef = useRef<Record<string, HTMLDivElement | null>>({})
  const routeLabelRef = useRef<HTMLDivElement | null>(null)
  const liveRef = useRef({
    onSelect,
    onTransitionSelect,
    selected: null as string | null,
    activeTransitionId: null as string | null,
  })
  liveRef.current.onSelect = onSelect
  liveRef.current.onTransitionSelect = onTransitionSelect

  // One arrow per directed building pair, volume-weighted, worst tone wins.
  const routes = useMemo(() => {
    const byId = new Map(buildings.map((building) => [building.id, building]))
    const grouped = new Map<string, SceneRoute>()
    for (const transition of transitions) {
      if (transition.same_building) continue
      if (!byId.has(transition.from_building_id) || !byId.has(transition.to_building_id)) continue
      const key = `${transition.from_building_id}:${transition.to_building_id}`
      const tone: Tone =
        transition.feasible === false
          ? 'infeasible'
          : transition.unknown_distance
            ? 'unknown'
            : transition.tight
              ? 'tight'
              : 'feasible'
      const existing = grouped.get(key)
      if (existing) {
        existing.students += transition.student_count
        existing.transitions.push(transition)
        if (TONE_RANK[tone] > TONE_RANK[existing.tone]) existing.tone = tone
      } else {
        grouped.set(key, {
          key,
          fromId: transition.from_building_id,
          toId: transition.to_building_id,
          students: transition.student_count,
          tone,
          transitions: [transition],
        })
      }
    }
    return Array.from(grouped.values())
  }, [buildings, transitions])

  useEffect(() => {
    const host = hostRef.current
    if (!host || buildings.length === 0) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      host.dataset.webgl = 'unsupported'
      return
    }

    const scene = new THREE.Scene()
    const width = host.clientWidth || 800
    const height = host.clientHeight || 460
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.5, 900)
    camera.position.set(96, 108, 128)

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(width, height)
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.touchAction = 'none'
    host.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 4, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 62
    controls.maxDistance = 260
    controls.maxPolarAngle = Math.PI * 0.47
    controls.update()

    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3550, 1.15))
    const sun = new THREE.DirectionalLight(0xffffff, 1.45)
    sun.position.set(48, 74, 36)
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0xffffff, 0.4)
    fill.position.set(-52, 38, -34)
    scene.add(fill)

    const groundMaterial = new THREE.MeshStandardMaterial({
      color: cssColour('--c-mapRoad', '#e2e8f0'),
      roughness: 1,
      metalness: 0,
    })
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 98), groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.03
    scene.add(ground)

    const grid = new THREE.GridHelper(140, 35, cssColour('--c-mapStroke', '#cbd5e1'), cssColour('--c-mapStroke', '#cbd5e1'))
    const gridMaterial = grid.material as THREE.Material
    gridMaterial.opacity = 0.22
    gridMaterial.transparent = true
    grid.position.y = 0.01
    scene.add(grid)

    // Two circulation ribbons trace the same axes as the 2D plan's main roads.
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: cssColour('--c-mapLane', '#cbd5e1'),
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
    })
    const horizontalRoad = new THREE.Mesh(new THREE.PlaneGeometry(138, 3.4), roadMaterial)
    horizontalRoad.rotation.x = -Math.PI / 2
    horizontalRoad.position.set(0, 0.02, -2)
    scene.add(horizontalRoad)
    const verticalRoad = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 94), roadMaterial)
    verticalRoad.rotation.x = -Math.PI / 2
    verticalRoad.position.set(22, 0.02, 0)
    scene.add(verticalRoad)

    const buildingMeshes: THREE.Mesh[] = []
    const anchors = new Map<string, THREE.Vector3>()
    const selectionTargets = new Map<string, { body: THREE.MeshStandardMaterial; cap: THREE.MeshStandardMaterial; edges: THREE.LineBasicMaterial }>()

    for (const building of buildings) {
      const { w, d, h } = sizeOf(building)
      const centre = centreOf(building)
      const accent = new THREE.Color(building.accent)
      const group = new THREE.Group()
      group.position.set(centre.x, 0, centre.z)

      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: accent
          .clone()
          .offsetHSL(0, -0.22, 0.05)
          .lerp(cssColour('--c-mapBlock', '#0c1728'), 0.3),
        roughness: 0.62,
        metalness: 0.18,
        emissive: accent,
        emissiveIntensity: 0.08,
      })
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMaterial)
      body.position.y = h / 2
      body.userData = { kind: 'building', id: building.id }

      const edgeMaterial = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.85 })
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), edgeMaterial)
      edges.position.copy(body.position)

      const capMaterial = new THREE.MeshStandardMaterial({
        color: accent,
        emissive: accent,
        emissiveIntensity: 0.45,
        roughness: 0.4,
        metalness: 0.3,
      })
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.995, 0.3, d * 0.995), capMaterial)
      cap.position.y = h + 0.15

      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.9, 0.14, d + 0.9),
        new THREE.MeshStandardMaterial({ color: accent, transparent: true, opacity: 0.22 }),
      )
      plinth.position.y = 0.05

      group.add(plinth, body, edges, cap)
      scene.add(group)
      buildingMeshes.push(body)
      anchors.set(building.id, new THREE.Vector3(centre.x, h + 1.4, centre.z))
      selectionTargets.set(building.id, { body: bodyMaterial, cap: capMaterial, edges: edgeMaterial })
    }

    const routeGroup = new THREE.Group()
    scene.add(routeGroup)
    const routeMeshes: THREE.Mesh[] = []
    const routeAnchors = new Map<string, THREE.Vector3>()
    const routeByKey = new Map<string, SceneRoute>()
    const transitionToRoute = new Map<string, string>()

    const disposeRouteMaterial = (object: THREE.Object3D) => {
      const mesh = object as THREE.Mesh
      mesh.geometry?.dispose()
      const material = mesh.material
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
      else material?.dispose()
    }

    const rebuildRoutes = (routeList: SceneRoute[]) => {
      for (const child of [...routeGroup.children]) {
        routeGroup.remove(child)
        disposeRouteMaterial(child)
      }
      routeMeshes.length = 0
      routeAnchors.clear()
      routeByKey.clear()
      transitionToRoute.clear()

      for (const route of routeList) {
        const from = buildings.find((building) => building.id === route.fromId)
        const to = buildings.find((building) => building.id === route.toId)
        if (!from || !to) continue
        const fromCentre = centreOf(from)
        const toCentre = centreOf(to)
        const start = edgePoint(from, toCentre.x, toCentre.z, 0.5)
        const end = edgePoint(to, fromCentre.x, fromCentre.z, 0.5)
        const lift = Math.max(sizeOf(from).h, sizeOf(to).h) + 7
        const startVector = new THREE.Vector3(start.x, sizeOf(from).h * 0.55, start.z)
        const endVector = new THREE.Vector3(end.x, sizeOf(to).h * 0.55, end.z)
        const control = new THREE.Vector3(
          (start.x + end.x) / 2,
          lift + Math.hypot(end.x - start.x, end.z - start.z) * 0.12,
          (start.z + end.z) / 2,
        )
        const curve = new THREE.QuadraticBezierCurve3(startVector, control, endVector)
        const colour = TONE_COLOURS[route.tone]
        const radius = 0.2 + Math.min(0.42, Math.log2(route.students + 1) * 0.075)
        const tube = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 40, radius, 8, false),
          new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.92 }),
        )
        tube.userData = { kind: 'route', key: route.key }
        routeGroup.add(tube)
        routeMeshes.push(tube)
        routeAnchors.set(route.key, curve.getPointAt(0.55))
        routeByKey.set(route.key, route)
        for (const transition of route.transitions) transitionToRoute.set(transition.transition_id, route.key)

        const tangent = curve.getTangentAt(0.985).normalize()
        const arrow = new THREE.Mesh(
          new THREE.ConeGeometry(radius * 2.4, radius * 5.4, 10),
          new THREE.MeshBasicMaterial({ color: colour }),
        )
        arrow.position.copy(endVector)
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent)
        arrow.userData = { kind: 'route', key: route.key }
        routeGroup.add(arrow)
        routeMeshes.push(arrow)
      }
    }
    rebuildRoutes(routes)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let downAt = { x: 0, y: 0, time: 0 }

    const onPointerDown = (event: PointerEvent) => {
      downAt = { x: event.clientX, y: event.clientY, time: performance.now() }
    }
    const onPointerUp = (event: PointerEvent) => {
      const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y)
      if (moved > 5 || performance.now() - downAt.time > 600) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const targets = showMovement ? [...buildingMeshes, ...routeMeshes] : buildingMeshes
      const hit = raycaster.intersectObjects(targets, false)[0]
      if (!hit) return
      const data = hit.object.userData as { kind?: string; id?: string; key?: string }
      if (data.kind === 'building' && data.id) {
        liveRef.current.onSelect(data.id)
        return
      }
      if (data.kind === 'route' && data.key) {
        const route = routeByKey.get(data.key)
        if (route) liveRef.current.onTransitionSelect(route.transitions[0])
      }
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)

    const resize = () => {
      const nextWidth = host.clientWidth || 800
      const nextHeight = host.clientHeight || 460
      camera.aspect = nextWidth / nextHeight
      camera.updateProjectionMatrix()
      renderer.setSize(nextWidth, nextHeight)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)

    const themeObserver = new MutationObserver(() => {
      groundMaterial.color = cssColour('--c-mapRoad', '#e2e8f0')
      roadMaterial.color = cssColour('--c-mapLane', '#cbd5e1')
      const next = cssColour('--c-mapStroke', '#cbd5e1')
      const gridMat = grid.material as THREE.LineBasicMaterial
      gridMat.color = next
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    let frame = 0
    const projected = new THREE.Vector3()
    const render = () => {
      frame = requestAnimationFrame(render)
      controls.update()
      renderer.render(scene, camera)

      const currentWidth = renderer.domElement.clientWidth
      const currentHeight = renderer.domElement.clientHeight
      for (const building of buildings) {
        const element = labelsRef.current[building.id]
        const anchor = anchors.get(building.id)
        if (!element || !anchor) continue
        projected.copy(anchor).project(camera)
        const x = (projected.x * 0.5 + 0.5) * currentWidth
        const y = (-projected.y * 0.5 + 0.5) * currentHeight
        element.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`
        element.style.opacity = projected.z > 1 ? '0' : '1'
      }

      const routeLabel = routeLabelRef.current
      const activeRouteKey = transitionToRoute.get(liveRef.current.activeTransitionId ?? '')
      if (routeLabel && activeRouteKey) {
        const anchor = routeAnchors.get(activeRouteKey)
        if (anchor) {
          projected.copy(anchor).project(camera)
          const x = (projected.x * 0.5 + 0.5) * currentWidth
          const y = (-projected.y * 0.5 + 0.5) * currentHeight
          routeLabel.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`
          routeLabel.style.opacity = projected.z > 1 ? '0' : '1'
        }
      }
    }
    render()

    const state = {
      scene,
      camera,
      renderer,
      controls,
      selectionTargets,
      routeGroup,
      routeMeshes,
      rebuildRoutes,
      resize,
    }
    ;(host as unknown as { __scene?: unknown }).__scene = state

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      themeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const material = (mesh as unknown as { material?: THREE.Material | THREE.Material[] }).material
        if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
        else material?.dispose()
      })
      renderer.dispose()
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement)
      delete (host as unknown as { __scene?: unknown }).__scene
    }
    // The scene is rebuilt only when the building set changes; selection,
    // movement and visibility are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildings])

  // Selection highlight.
  useEffect(() => {
    liveRef.current.selected = selected
    const host = hostRef.current
    const state = (host as unknown as { __scene?: { selectionTargets: Map<string, { body: THREE.MeshStandardMaterial; cap: THREE.MeshStandardMaterial; edges: THREE.LineBasicMaterial }> } } | null)?.__scene
    if (!state) return
    for (const [id, target] of state.selectionTargets) {
      const active = id === selected
      target.body.emissiveIntensity = active ? 0.5 : 0.12
      target.cap.emissiveIntensity = active ? 1.1 : 0.45
      target.edges.opacity = active ? 1 : 0.45
    }
  }, [selected, buildings])

  // Movement overlay: rebuild the arcs whenever the returned transitions change
  // (day/slot switch), then emphasise the selected route. The scene is created
  // before `/api/movement` resolves, so routes cannot be baked in at init time.
  useEffect(() => {
    liveRef.current.activeTransitionId = activeTransitionId
    const host = hostRef.current
    const state = (host as unknown as {
      __scene?: {
        routeGroup: THREE.Group
        routeMeshes: THREE.Mesh[]
        rebuildRoutes: (list: SceneRoute[]) => void
      }
    } | null)?.__scene
    if (!state) return
    state.rebuildRoutes(routes)
    state.routeGroup.visible = showMovement
    const routeLabel = routeLabelRef.current
    if (routeLabel) {
      const active = routes.find((route) =>
        route.transitions.some((transition) => transition.transition_id === activeTransitionId),
      )
      routeLabel.textContent = active ? `${active.students} student trips` : ''
    }
    for (const mesh of state.routeMeshes) {
      const key = (mesh.userData as { key?: string }).key
      const route = routes.find((item) => item.key === key)
      const active = Boolean(
        route && route.transitions.some((transition) => transition.transition_id === activeTransitionId),
      )
      const material = mesh.material as THREE.MeshBasicMaterial
      material.opacity = active ? 1 : 0.5
    }
  }, [showMovement, activeTransitionId, routes, buildings])

  return (
    <div className="relative overflow-hidden rounded-md border border-lineSoft bg-cell" style={{ height: 460 }}>
      <div ref={hostRef} className="absolute inset-0" />
      {buildings.map((building) => (
        <div
          key={building.id}
          ref={(element) => {
            labelsRef.current[building.id] = element
          }}
          className="pointer-events-none absolute left-0 top-0 will-change-transform"
        >
          <div
            className="flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.06em] shadow-sm backdrop-blur-sm"
            style={{
              borderColor: `${building.accent}66`,
              backgroundColor: 'rgb(var(--c-panel) / 0.82)',
              color: 'rgb(var(--c-ink))',
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: building.accent }} />
            {building.code}
            <span className="font-sans text-[9px] normal-case tracking-normal text-muted">{building.name}</span>
          </div>
        </div>
      ))}
      <div
        ref={routeLabelRef}
        className="pointer-events-none absolute left-0 top-0 rounded border border-cyan/40 bg-panel/90 px-1.5 py-0.5 font-mono text-[9px] text-ink opacity-0 backdrop-blur-sm will-change-transform"
      />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded border border-lineSoft bg-panel/85 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.06em] text-faint backdrop-blur-sm">
        Schematic massing · storey height assumed 2.1 u · not surveyed
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 rounded border border-lineSoft bg-panel/85 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.06em] text-faint backdrop-blur-sm">
        Drag to orbit · scroll to zoom · click a block
      </div>
    </div>
  )
}
