<template>
  <!-- Web ComponentをVue refで参照する -->
  <my-element ref="myEl" />
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const myEl = ref(null)

defineExpose({ myEl })
</script>
