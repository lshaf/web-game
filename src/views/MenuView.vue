<script setup>
import { useRouter } from 'vue-router'
import GameSelect from '../components/GameSelect.vue'
import { games } from '../games.js'

const router = useRouter()

function select(id) {
  router.push({ name: 'play', params: { id } })
}
</script>

<template>
  <GameSelect :games="games" @select="select" />
</template>
