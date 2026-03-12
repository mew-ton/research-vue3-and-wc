/**
 * 検証: Nuxt4のページ遷移(Vue Router)によるunmountで
 *        Web Componentへのrefがどう振る舞うかを確認する
 *
 * Nuxt4固有のパターン:
 *   A) Vue Router の RouterView によるページ遷移 (unmountのトリガーが異なる)
 *   B) Pinia store に WC ref を保存したケース (ページ間で永続)
 *   C) アプリスコープのcomposable (Nuxtプラグイン相当) が WC ref を保持
 *   D) Nuxt の useState() 相当 (コンポーネント外の ref で状態を永続化)
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { config, mount } from '@vue/test-utils'
import {
  defineComponent, ref, h, watch, onBeforeUnmount, onUnmounted,
  nextTick, createApp, inject, provide,
} from 'vue'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { createPinia, defineStore, setActivePinia } from 'pinia'
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

    const App = defineComponent({
      setup() {
        return () => h(RouterView)
      },
    })

    const wrapper = mount(App, {
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

    // A-2の結論: router.push()でもライフサイクルフックの動作は同じか
    // beforeUnmount: 要素あり / onUnmounted: null が期待値
    expect(refAtBeforeUnmount).toBeTruthy()   // beforeUnmount時はまだ要素がある
    expect(refAtUnmounted).toBeNull()          // onUnmounted時にはnull

    wrapper.unmount()
  })
})

// ─────────────────────────────────────────────────────────────
// ケースB: Pinia store に WC ref を保存したケース
//          (Nuxt4でPiniaを使う典型パターン)
// ─────────────────────────────────────────────────────────────
describe('ケースB: Pinia store が WC ref を保持するケース', () => {
  it('B-1: storeにref.valueを保存 → ページ遷移後もstoreに古い要素が残るか', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)

    const useWcStore = defineStore('wc', {
      state: () => ({ wcElement: null }),
      actions: {
        setElement(el) { this.wcElement = el },
      },
    })

    const PageWithWC = defineComponent({
      name: 'PageWithWC',
      setup() {
        const store = useWcStore()
        const myEl = ref(null)
        // watchでstoreに同期 (よくあるパターン)
        watch(myEl, (val) => {
          store.setElement(val)
          console.log('[B-1] watch fired → store.wcElement:', val?.tagName ?? val)
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
      global: { plugins: [router, pinia] },
    })

    await router.isReady()
    await nextTick()

    const store = useWcStore()
    console.log('[B-1] before navigate - store.wcElement:', store.wcElement?.tagName, '| isConnected:', store.wcElement?.isConnected)
    expect(store.wcElement).toBeTruthy()

    // ページ遷移
    await router.push('/other')
    await nextTick()

    console.log('[B-1] after  navigate - store.wcElement:', store.wcElement?.tagName ?? store.wcElement)
    console.log('[B-1] after  navigate - isConnected:', store.wcElement?.isConnected)
    console.log('[B-1] → store に古い要素が残っている:', !!store.wcElement)
    // ★ここが重要: storeに古い要素(isConnected:false)が残り続けるか
    // watchはコンポーネントunmount時に停止するため、
    // ref→nullの変化がstoreに反映されない可能性が高い

    wrapper.unmount()
  })
})

// ─────────────────────────────────────────────────────────────
// ケースC: アプリスコープのcomposable (Nuxtプラグイン相当)
//          アプリのライフサイクルで生きているcomposableが
//          ページコンポーネントのWC refを保持するケース
// ─────────────────────────────────────────────────────────────
describe('ケースC: アプリスコープのcomposable (Nuxtプラグイン相当)', () => {
  it('C-1: コンポーネント外のrefがWC要素を保持 → ページ遷移後も残るか', async () => {
    // Nuxtの useState() や アプリスコープのcomposable は
    // コンポーネントのライフサイクルに紐づかない
    // → watch が自動停止しない → 古い要素が残り続ける可能性
    const appScopedRef = ref(null)  // ← コンポーネント外 (Nuxtの useState() 相当)

    const PageWithWC = defineComponent({
      name: 'PageWithWC',
      setup() {
        const myEl = ref(null)
        // ページコンポーネント内から アプリスコープのrefに同期
        watch(myEl, (val) => {
          appScopedRef.value = val
          console.log('[C-1] page watch fired → appScopedRef.value:', val?.tagName ?? val)
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

    console.log('[C-1] before navigate - appScopedRef.value:', appScopedRef.value?.tagName, '| isConnected:', appScopedRef.value?.isConnected)
    expect(appScopedRef.value).toBeTruthy()

    await router.push('/other')
    await nextTick()

    console.log('[C-1] after  navigate - appScopedRef.value:', appScopedRef.value?.tagName ?? appScopedRef.value)
    console.log('[C-1] after  navigate - isConnected:', appScopedRef.value?.isConnected)
    console.log('[C-1] → アプリスコープのrefに古い要素が残っている:', !!appScopedRef.value)

    wrapper.unmount()
  })
})

// ─────────────────────────────────────────────────────────────
// ケースD: Nuxtの useState() 相当のパターン
//          (コンポーネント外のrefに直接WC要素を格納)
// ─────────────────────────────────────────────────────────────
describe('ケースD: useState() 相当に WC の ref.value を直接格納', () => {
  it('D-1: useState相当のrefにWC要素を直接格納 → ページ遷移後も残るか', async () => {
    // Nuxt の useState() はサーバー/クライアント間で共有される永続的なref
    // コンポーネントのライフサイクルとは無関係
    const nuxtState = ref(null)  // useState('wcEl', () => null) に相当

    const PageWithWC = defineComponent({
      name: 'PageWithWC',
      setup() {
        const myEl = ref(null)
        // onMounted でnuxtStateに直接代入 (テンプレートrefを外部stateに保存)
        const { onMounted } = require('vue')
        onMounted(() => {
          nuxtState.value = myEl.value
          console.log('[D-1] onMounted → nuxtState.value:', nuxtState.value?.tagName)
        })
        onBeforeUnmount(() => {
          console.log('[D-1] onBeforeUnmount → nuxtState.value:', nuxtState.value?.tagName, '(まだ残っている)')
          // ここで明示的にクリアしない限り残り続ける
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

    console.log('[D-1] before navigate - nuxtState.value:', nuxtState.value?.tagName, '| isConnected:', nuxtState.value?.isConnected)
    expect(nuxtState.value).toBeTruthy()

    await router.push('/other')
    await nextTick()

    console.log('[D-1] after  navigate - nuxtState.value:', nuxtState.value?.tagName ?? nuxtState.value)
    console.log('[D-1] after  navigate - isConnected:', nuxtState.value?.isConnected)
    console.log('[D-1] → nuxtState に古い要素が残っている:', !!nuxtState.value)
    // Nuxtのusestate相当: 明示的にクリアしない限り確実に残る

    wrapper.unmount()
  })

  it('D-2: onBeforeUnmount で明示的にクリアすれば解決するか', async () => {
    const nuxtState = ref(null)

    const PageWithWC = defineComponent({
      name: 'PageWithWC',
      setup() {
        const myEl = ref(null)
        const { onMounted } = require('vue')
        onMounted(() => { nuxtState.value = myEl.value })
        onBeforeUnmount(() => {
          // ★ 明示的にクリア
          nuxtState.value = null
          console.log('[D-2] onBeforeUnmount → nuxtState cleared')
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

    console.log('[D-2] after navigate - nuxtState.value:', nuxtState.value)
    expect(nuxtState.value).toBeNull()  // 明示的クリアで解決

    wrapper.unmount()
  })
})
