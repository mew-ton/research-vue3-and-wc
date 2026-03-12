/**
 * 検証: Vue3コンポーネントがunmountされた後、
 *        Web Componentへのrefがnullになるかどうかをテストする
 *
 * 期待動作: unmount後はref.value === null
 * 疑惑の挙動: unmount後もref.value に要素が残ったままになる
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { config, mount } from '@vue/test-utils'
import {
  defineComponent, ref, h, watch, onBeforeUnmount, onUnmounted, nextTick,
} from 'vue'
import './MyElement.js'
import ChildWithWC from './ChildWithWC.vue'

beforeAll(() => {
  config.global = {
    config: {
      compilerOptions: {
        isCustomElement: (tag) => tag.includes('-'),
      },
    },
  }
})

describe('Web Component ref の unmount 後の挙動', () => {

  // ──────────────────────────────────────────────
  // ケース1: 直接 wrapper.unmount() した場合
  // ──────────────────────────────────────────────
  it('ケース1: wrapper.unmount()後、exposed myEl は null になるか', async () => {
    const wrapper = mount(ChildWithWC, { attachTo: document.body })
    await nextTick()

    const elBefore = wrapper.vm.myEl
    console.log('[Case1] before unmount  myEl:', elBefore?.tagName, '| isConnected:', elBefore?.isConnected)
    expect(elBefore).toBeTruthy()

    wrapper.unmount()

    const elAfter = wrapper.vm.myEl
    console.log('[Case1] after  unmount  myEl:', elAfter)
    // 結果
    expect(elAfter).toBeNull()
  })

  // ──────────────────────────────────────────────
  // ケース2a: beforeUnmount フック内での ref.value
  //           (DOM要素はまだ存在しているはず)
  // ──────────────────────────────────────────────
  it('ケース2a: beforeUnmount 時点で myEl.value は null か、それとも要素が残っているか', async () => {
    let refAtBeforeUnmount = 'not-called'

    const Child = defineComponent({
      setup() {
        const myEl = ref(null)
        onBeforeUnmount(() => {
          refAtBeforeUnmount = myEl.value
          console.log('[Case2a] onBeforeUnmount - myEl.value:', myEl.value)
        })
        return () => h('my-element', { ref: myEl })
      },
    })

    const wrapper = mount(Child, { attachTo: document.body })
    await nextTick()
    wrapper.unmount()

    console.log('[Case2a] myEl.value at beforeUnmount:', refAtBeforeUnmount?.tagName ?? refAtBeforeUnmount)
    // beforeUnmount ではまだDOM要素を保持している(nullでない)はず
    // これがユーザーが「残っている」と感じた挙動の可能性
    console.log('[Case2a] → still has element:', !!refAtBeforeUnmount)
  })

  // ──────────────────────────────────────────────
  // ケース2b: onUnmounted フック内での ref.value
  //           Vue は onUnmounted 前に ref をクリアするか？
  // ──────────────────────────────────────────────
  it('ケース2b: onUnmounted 時点で myEl.value は null か', async () => {
    let refAtUnmounted = 'not-called'

    const Child = defineComponent({
      setup() {
        const myEl = ref(null)
        onUnmounted(() => {
          refAtUnmounted = myEl.value
          console.log('[Case2b] onUnmounted - myEl.value:', myEl.value)
        })
        return () => h('my-element', { ref: myEl })
      },
    })

    const wrapper = mount(Child, { attachTo: document.body })
    await nextTick()
    wrapper.unmount()

    console.log('[Case2b] myEl.value at onUnmounted:', refAtUnmounted)
    console.log('[Case2b] → null?', refAtUnmounted === null)
    // 検証: onUnmounted の時点で null になっているか
    expect(refAtUnmounted).toBeNull()
  })

  // ──────────────────────────────────────────────
  // ケース3: watch で外部変数に値をリークしたケース
  //          アンマウント後 watchEffect がクリーンアップされなければ
  //          古い要素が外部変数に残り続ける
  // ──────────────────────────────────────────────
  it('ケース3: watch(myEl) でリークした外部変数はunmount後も古い要素を持つか', async () => {
    let leakedEl = null

    const Child = defineComponent({
      setup() {
        const myEl = ref(null)
        // watch で外部変数に同期 (よくある「storeへの保存」パターン)
        watch(myEl, (val) => {
          leakedEl = val
          console.log('[Case3] watch fired - leakedEl:', val?.tagName ?? val)
        })
        return () => h('my-element', { ref: myEl })
      },
    })

    const wrapper = mount(Child, { attachTo: document.body })
    await nextTick()

    console.log('[Case3] before unmount - leakedEl:', leakedEl?.tagName, '| isConnected:', leakedEl?.isConnected)
    expect(leakedEl).toBeTruthy()

    wrapper.unmount()
    await nextTick()

    console.log('[Case3] after  unmount - leakedEl:', leakedEl?.tagName ?? leakedEl)
    console.log('[Case3] after  unmount - leakedEl?.isConnected:', leakedEl?.isConnected)
    // watch はコンポーネントのライフサイクルに紐づくため、
    // unmount時に watch も停止 → leakedEl は最後の値のまま残る
    // (refがnullになったとき watchが再fire → leakedEl=null になるか？)
    console.log('[Case3] → leakedEl is null after unmount:', leakedEl === null)
  })

  // ──────────────────────────────────────────────
  // ケース4: v-if でアンマウントした後の子内部 ref
  // ──────────────────────────────────────────────
  it('ケース4: v-if=false後、子コンポーネント内部のWC refはnullになるか', async () => {
    let childInternalRef = null

    const Child = defineComponent({
      setup() {
        const myEl = ref(null)
        childInternalRef = myEl  // RefImpl ごと外部に保持
        return () => h('my-element', { ref: myEl })
      },
    })

    const Parent = defineComponent({
      components: { Child },
      setup() {
        const show = ref(true)
        return { show }
      },
      template: `<Child v-if="show" />`,
    })

    const wrapper = mount(Parent, { attachTo: document.body })
    await nextTick()

    console.log('[Case4] before v-if=false - childInternalRef.value:', childInternalRef?.value?.tagName, '| isConnected:', childInternalRef?.value?.isConnected)
    expect(childInternalRef?.value).toBeTruthy()

    wrapper.vm.show = false
    await nextTick()

    console.log('[Case4] after  v-if=false - childInternalRef.value:', childInternalRef?.value)
    console.log('[Case4] after  v-if=false - isConnected:', childInternalRef?.value?.isConnected)
    console.log('[Case4] → null?', childInternalRef?.value === null)

    // 本命: v-if=false でアンマウント後、WCへのrefはnullになっているか
    expect(childInternalRef?.value).toBeNull()

    wrapper.unmount()
  })

  // ──────────────────────────────────────────────
  // ケース5: provide/inject でrefを上位に渡したケース
  // ──────────────────────────────────────────────
  it('ケース5: provide/inject でrefを上位に渡した場合、unmount後の値は?', async () => {
    const INJECT_KEY = Symbol('myEl')

    const Child = defineComponent({
      setup() {
        const myEl = ref(null)
        // provide で上位に公開 (RefImpl ごと)
        // Vue3 では provide はコンポーネントに紐づくため、
        // unmount後も inject 先が保持していれば古い ref が残る
        const { provide } = require('vue')
        provide(INJECT_KEY, myEl)
        return () => h('my-element', { ref: myEl })
      },
    })

    let injectedRef = null
    const Parent = defineComponent({
      components: { Child },
      setup() {
        const show = ref(true)
        const { inject } = require('vue')
        // ※ inject は provide した子が存在する間のみ有効
        return { show }
      },
      template: `<Child v-if="show" ref="childComp" />`,
    })

    const wrapper = mount(Parent, { attachTo: document.body })
    await nextTick()

    // 子コンポーネントを直接参照してinjectedRefを取得
    const childWrapper = wrapper.findComponent(Child)
    injectedRef = childWrapper?.vm?.$.setupState?.myEl ?? null

    console.log('[Case5] before v-if=false - injectedRef.value:', injectedRef?.value?.tagName, '| isConnected:', injectedRef?.value?.isConnected)

    wrapper.vm.show = false
    await nextTick()

    console.log('[Case5] after  v-if=false - injectedRef.value:', injectedRef?.value)
    console.log('[Case5] after  v-if=false - isConnected:', injectedRef?.value?.isConnected)
    console.log('[Case5] → null?', injectedRef?.value === null)

    wrapper.unmount()
  })
})
