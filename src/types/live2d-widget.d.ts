declare module 'live2d-widget' {
  export interface Live2DWidgetOptions {
    model?: { jsonPath?: string; scale?: number }
    display?: {
      superSample?: number
      width?: number
      height?: number
      position?: string
      hOffset?: number
      vOffset?: number
    }
    mobile?: { show?: boolean; scale?: number }
    react?: { opacityDefault?: number; opacityOnHover?: number }
    dialog?: {
      enable?: boolean
      hitokoto?: boolean
      script?: { tips?: string[]; unloginList?: string[] }
    }
    idle?: { interval?: number }
  }
  export interface Live2DWidget {
    init: (options?: Live2DWidgetOptions) => void
    destroy?: () => void
  }
  const L2Dwidget: Live2DWidget
  export default L2Dwidget
}
