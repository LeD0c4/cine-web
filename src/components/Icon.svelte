<script lang="ts">
  let { path, size = 1.5 }: { path: string; size?: number } = $props();
</script>

<svg viewBox="0 0 24 24" width="{size}em" height="{size}em" fill="currentColor" aria-hidden="true"><path d={path} /></svg>

<style>
  svg {
    flex: none;
    display: block;
  }
</style>
