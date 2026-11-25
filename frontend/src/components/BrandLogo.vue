<script>
let logoSeq = 0
</script>

<script setup>
defineProps({
  size: { type: [Number, String], default: 28 },
})
const id = `wg-brand-${++logoSeq}`
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class="shrink-0 drop-shadow-[0_0_8px_rgba(235,215,167,0.35)]"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="`${id}-star`" x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#fffaf0" />
        <stop offset="52%" stop-color="#ebd7a7" />
        <stop offset="100%" stop-color="#b89452" />
      </linearGradient>
      <linearGradient :id="`${id}-orbit`" x1="6" y1="36" x2="58" y2="28" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#b89452" stop-opacity="0.08" />
        <stop offset="38%" stop-color="#ebd7a7" stop-opacity="0.72" />
        <stop offset="88%" stop-color="#fffaf0" stop-opacity="0.95" />
        <stop offset="100%" stop-color="#fffaf0" stop-opacity="0.2" />
      </linearGradient>
      <radialGradient :id="`${id}-core`" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="1" />
        <stop offset="55%" stop-color="#fff6e0" stop-opacity="0.65" />
        <stop offset="100%" stop-color="#ebd7a7" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- 24° 倾角纤细椭圆星轨弧线（带渐隐缺口与伴星） -->
    <g transform="rotate(-24 32 32)">
      <path
        d="M 10.5 27.6 A 26 10.2 0 1 0 55.2 27.2"
        :stroke="`url(#${id}-orbit)`"
        stroke-width="1.65"
        stroke-linecap="round"
      />
      <!-- 伴星微光点 -->
      <circle cx="55.2" cy="27.2" r="2.2" fill="#fffaf0" />
      <circle cx="55.2" cy="27.2" r="4.6" :fill="`url(#${id}-core)`" opacity="0.65" />
    </g>

    <!-- 居中修长锐利 4 向微光星芒 -->
    <path
      d="M32 6.5 C33.1 24.4 39.6 30.9 57.5 32 C39.6 33.1 33.1 39.6 32 57.5 C30.9 39.6 24.4 33.1 6.5 32 C24.4 30.9 30.9 24.4 32 6.5 Z"
      :fill="`url(#${id}-star)`"
    />

    <!-- 中心柔和星核高光 -->
    <circle cx="32" cy="32" r="7.5" :fill="`url(#${id}-core)`" />
    <circle cx="32" cy="32" r="2.1" fill="#ffffff" />
  </svg>
</template>
