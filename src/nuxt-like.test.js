/**
 * 検証: Nuxt4のページ遷移(Vue Router)によるunmountで
 *        Web Componentへのrefがどう振る舞うかを確認する
 *
 * Nuxt4固有のパターン:
 *   A) Vue Router の RouterView によるページ遷移 (unmountのトリガーが異なる)
 *   B) アプリスコープのref (Nuxtプラグイン相当) が WC ref を保持
 *   C) Nuxt の useState() 相当 (コンポーネント外の ref で状態を永続化)
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { config, mount } from '@vue/test-utils'
import {
  defineComponent, ref, h, watch, onBeforeUnmount, onUnmounted, onMounted,
  nextTick,
} from 'vue'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import './MyElement.js'

beforeAll(() => {
  config.global = {
    config: {
      compilerOptions: {
        isCustomElement: (tag) => tag.includes('-'),
      },
    },
  }
})

// ─────────────────────────────────────────────────────────────
// ケースA: Vue Router による RouterView 経由のページ遷移
//          unmountのトリガーが router.push() の場合
// ─────────────────────────────────────────────────────────────
describe('ケースA: Vue Router のページ遷移によるunmount', () => {
  it('A-1: router.push() で別ページに遷移後、前ページのWC refはnullになるか', async () => {
    let capturedRef = null

    const PageWithWC = defineComponent({
      name: 'PageWithWC',
      setup() {
        const myEl = ref(null)
        capturedRef = myEl   // RefImpl ごと外部に保持 (検証用)
        return () => h('my-element', { ref: myEl })
      },
    })

    const OtherPage = defineComponent({
      name: 'OtherPage',
      setup() {
        return () => h('div', 'other page')
      },
    })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: PageWithWC },
        { path: '/other', component: OtherPage },
      ],
    })

    const wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), {
      attachTo: document.body,
      global: { plugins: [router] },
    })

    await router.isReady()
    await nextTick()

    console.log('[A-1] before navigate - capturedRef.value:', capturedRef?.value?.tagName, '| isConnected:', capturedRef?.value?.isConnected)
    expect(capturedRef?.value).toBeTruthy()

    // ページ遷移 (PageWithWC がunmount される)
    await router.push('/other')
    await nextTick()

    console.log('[A-1] after  navigate - capturedRef.value:', capturedRef?.value)
    console.log('[A-1] after  navigate - isConnected:', capturedRef?.value?.isConnected)
    console.log('[A-1] → null?', capturedRef?.value === null)

    // 結果: Vue Router経由でも ref はnullになるか？
    expect(capturedRef?.value).toBeNull()

    wrapper.unmount()
  })

  it('A-2: ページ遷移時の onBeforeUnmount / onUnmounted でのref状態', async () => {
    let refAtBeforeUnmount = 'not-called'
    let refAtUnmounted = 'not-called'

    const PageWithWC = defineComponent({
      name: 'PageWithWC',
      setup() {
        const myEl = ref(null)
        onBeforeUnmount(() => {
          refAtBeforeUnmount = myEl.value
          console.log('[A-2] onBeforeUnmount - myEl.value:', myEl.value?.tagName ?? myEl.value)
        })
        onUnmounted(() => {
          refAtUnmounted = myEl.value
          console.log('[A-2] onUnmounted     - myEl.value:', myEl.value)
        })
        return () => h('my-element', { ref: myEl })
      },
    })

    const OtherPage = defineComponent({ setup: () => () => h('div', 'other') })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: PageWithWC },
        { path: '/other', component: OtherPage },
      ],
    })

    const wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), {
      attachTo: document.body,
      global: { plugins: [router] },
    })

    await router.isReady()
    await nextTick()

    await router.push('/other')
    await nextTick()

    console.log('[A-2] onBeforeUnmount時のref:', refAtBeforeUnmount?.tagName ?? refAtBeforeUnmount)
    console.log('[A-2] onUnmounted時のref    :', refAtUnmounted)

    // router.push()でもライフサイクルフックの動作は直接unmountと同じ:
    // beforeUnmount: 要素あり / onUnmounted: null
    expect(refAtBeforeUnmount).toBeTruthy()
    expect(refAtUnmounted).toBeNull()

    wrapper.unmount()
  })
})

// ─────────────────────────────────────────────────────────────
// ケースB: アプリスコープのref (Nuxtプラグイン相当)
//          コンポーネント外の ref に watch() 経由で WC 要素を同期
// ─────────────────────────────────────────────────────────────
describe('ケースB: アプリスコープのref (Nuxtプラグイン相当)', () => {
  it('B-1: コンポーネント外のrefにwatch経由で同期 → ページ遷移後も古い要素が残るか', async () => {
    // Nuxtプラグインやアプリスコープのcomposableで持つ ref に相当
    // コンポーネントのライフサイクルと無関係に生き続ける
    const appScopedRef = ref(null)

    const PageWithWC = defineComponent({
      name: 'PageWithWC',
      setup() {
        const myEl = ref(null)
        // ページコンポーネント内から アプリスコープのrefに watch で同期
        watch(myEl, (val) => {
          appScopedRef.value = val
          console.log('[B-1] watch fired → appScopedRef.value:', val?.tagName ?? val)
        })
        return () => h('my-element', { ref: myEl })
      },
    })

    const OtherPage = defineComponent({ setup: () => () => h('div', 'other') })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: PageWithWC },
        { path: '/other', component: OtherPage },
      ],
    })

    const wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), {
      attachTo: document.body,
      global: { plugins: [router] },
    })

    await router.isReady()
    await nextTick()

    console.log('[B-1] before navigate - appScopedRef.value:', appScopedRef.value?.tagName, '| isConnected:', appScopedRef.value?.isConnected)
    expect(appScopedRef.value).toBeTruthy()

    await router.push('/other')
    await nextTick()

    console.log('[B-1] after  navigate - appScopedRef.value:', appScopedRef.value?.tagName ?? appScopedRef.value)
    console.log('[B-1] after  navigate - isConnected:', appScopedRef.value?.isConnected)
    console.log('[B-1] → 古い要素が残っている:', !!appScopedRef.value)
    // watchはコンポーネントunmount時に停止するため、ref→nullがappScopedRefに伝播しない

    wrapper.unmount()
  })
})

// ─────────────────────────────────────────────────────────────
// ケースC: Nuxtの useState() 相当のパターン
//          (コンポーネント外のrefにWC要素を直接格納)
// ─────────────────────────────────────────────────────────────
describe('ケースC: useState() 相当に WC の ref.value を直接格納', () => {
  it('C-1: onMountedで外部refに直接代入 → ページ遷移後も残るか', async () => {
    // Nuxt の useState() はコンポーネントのライフサイクルと無関係な永続的なref
    const nuxtState = ref(null)

    const PageWithWC = defineComponent({
      name: 'PageWithWC',
      setup() {
        const myEl = ref(null)
        onMounted(() => {
          nuxtState.value = myEl.value
          console.log('[C-1] onMounted → nuxtState.value:', nuxtState.value?.tagName)
        })
        onBeforeUnmount(() => {
          console.log('[C-1] onBeforeUnmount → nuxtState.value:', nuxtState.value?.tagName, '(まだ残っている)')
          // 明示的にクリアしない限り残り続ける
        })
        return () => h('my-element', { ref: myEl })
      },
    })

    const OtherPage = defineComponent({ setup: () => () => h('div', 'other') })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: PageWithWC },
        { path: '/other', component: OtherPage },
      ],
    })

    const wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), {
      attachTo: document.body,
      global: { plugins: [router] },
    })

    await router.isReady()
    await nextTick()

    console.log('[C-1] before navigate - nuxtState.value:', nuxtState.value?.tagName, '| isConnected:', nuxtState.value?.isConnected)
    expect(nuxtState.value).toBeTruthy()

    await router.push('/other')
    await nextTick()

    console.log('[C-1] after  navigate - nuxtState.value:', nuxtState.value?.tagName ?? nuxtState.value)
    console.log('[C-1] after  navigate - isConnected:', nuxtState.value?.isConnected)
    console.log('[C-1] → nuxtState に古い要素が残っている:', !!nuxtState.value)

    wrapper.unmount()
  })

  it('C-2: onBeforeUnmount で明示的にクリアすれば解決するか', async () => {
    const nuxtState = ref(null)

    const PageWithWC = defineComponent({
      name: 'PageWithWC',
      setup() {
        const myEl = ref(null)
        onMounted(() => { nuxtState.value = myEl.value })
        onBeforeUnmount(() => {
          // ★ 明示的にクリア
          nuxtState.value = null
          console.log('[C-2] onBeforeUnmount → nuxtState cleared')
        })
        return () => h('my-element', { ref: myEl })
      },
    })

    const OtherPage = defineComponent({ setup: () => () => h('div', 'other') })

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: PageWithWC },
        { path: '/other', component: OtherPage },
      ],
    })

    const wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), {
      attachTo: document.body,
      global: { plugins: [router] },
    })

    await router.isReady()
    await nextTick()

    await router.push('/other')
    await nextTick()

    console.log('[C-2] after navigate - nuxtState.value:', nuxtState.value)
    expect(nuxtState.value).toBeNull()  // 明示的クリアで解決

    wrapper.unmount()
  })
})
