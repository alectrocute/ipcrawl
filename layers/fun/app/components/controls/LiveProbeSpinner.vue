<template>
  <svg
    class="live-spinner"
    viewBox="0 0 24 24"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      class="spinner_7uc5 spinner_ZAxd"
      x="1"
      y="6"
      width="2.8"
      height="12"
    />
    <rect
      class="spinner_7uc5 spinner_RibN"
      x="5.8"
      y="6"
      width="2.8"
      height="12"
    />
    <rect
      class="spinner_7uc5"
      x="10.6"
      y="6"
      width="2.8"
      height="12"
    />
    <rect
      class="spinner_7uc5 spinner_RibN"
      x="15.4"
      y="6"
      width="2.8"
      height="12"
    />
    <rect
      class="spinner_7uc5 spinner_ZAxd"
      x="20.2"
      y="6"
      width="2.8"
      height="12"
    />
  </svg>
</template>

<style scoped>
.live-spinner {
  width: 1.05em;
  height: 1.05em;
  display: block;
  color: rgb(255, 130, 130);
  overflow: hidden;
  flex: 0 0 auto;
}

.live-spinner rect {
  fill: currentColor;
  transform-box: fill-box;
  transform-origin: center;
}

.spinner_7uc5 {
  animation: spinner_3l8F 0.9s linear infinite;
  animation-delay: -0.9s;
}

.spinner_RibN {
  animation-delay: -0.7s;
}

.spinner_ZAxd {
  animation-delay: -0.5s;
}

@keyframes spinner_3l8F {
  0%,
  66.66% {
    transform: translateY(0) scaleY(1);
    animation-timing-function: cubic-bezier(0.14, 0.73, 0.34, 1);
  }
  33.33% {
    transform: translateY(-1px) scaleY(1.45);
    animation-timing-function: cubic-bezier(0.65, 0.26, 0.82, 0.45);
  }
}
</style>
