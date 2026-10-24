<script lang="ts">
  let { size = 1, compact = false }: { size?: number; compact?: boolean } = $props();
  // Relatif à l'interface : dans les applis (Android, LG) elle n'est pas servie à la racine.
  const mark = `${import.meta.env.BASE_URL}mark.png`;
</script>

<span class="brand" style:font-size="{size}rem">
  <img src={mark} alt="" />
  {#if !compact}
    <span class="word"><span class="s">SELVANIA</span><span class="c">CINÉ</span></span>
  {/if}
</span>

<style>
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.55em;
  }
  img {
    height: 2em;
    width: auto;
    filter: drop-shadow(0 0.15em 0.5em rgba(253, 122, 16, 0.35));
  }
  .word {
    display: inline-flex;
    align-items: baseline;
    gap: 0.4em;
    font-weight: 800;
    letter-spacing: 0.16em;
    font-size: 1.05em;
    line-height: 1;
  }
  .s {
    background: var(--silver);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .c {
    background: var(--gold-grad);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
</style>
