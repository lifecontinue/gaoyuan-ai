import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './tailwind.css'
import './styles/main.css'
import './styles/paper.css'
import './styles/rough.css'

// 引入 Leaflet CSS（置于 Tailwind 之后，确保其边框样式不被 preflight 覆盖）
import 'leaflet/dist/leaflet.css'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
