<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import client from '../Scrcpy/adb-client'

const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true
  }
})

const emit = defineEmits(['update:modelValue', 'select-device'])

const drawer = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const deviceList = ref([])
const isLoading = ref(false)

const updateDeviceList = async () => {
  if (!client.isSupportedWebUsb) {
    return
  }
  isLoading.value = true
  try {
    deviceList.value = await client.getUsbDeviceList()
  } catch (error) {
    console.error('Failed to get device list:', error)
  } finally {
    isLoading.value = false
  }
}

const selectDevice = (device) => {
  emit('select-device', device)
  drawer.value = false
}

const addDevice = async () => {
  try {
    const newDevice = await client.addUsbDevice()
    if (newDevice) {
      await updateDeviceList()
      // 如果只有一台设备，自动选择
      if (deviceList.value.length === 1) {
        selectDevice(deviceList.value[0])
      }
    }
  } catch (error) {
    console.error('Failed to add device:', error)
  }
}

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    updateDeviceList()
  }
})

onMounted(() => {
  if (props.modelValue) {
    updateDeviceList()
  }
})
</script>

<template>
  <v-navigation-drawer
    v-model="drawer"
    location="top"
    temporary
    class="device-drawer"
  >
    <v-card flat>
      <v-card-title class="d-flex justify-space-between align-center pa-4">
        <span>选择调试设备</span>
        <v-btn icon @click="drawer = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>
      <v-card-text>
        <v-alert
          type="info"
          variant="tonal"
          class="mb-4"
        >
          支持将您本地设备快速接入到High-QA平台，提供设备调试、应用管理、日志查看等功能
        </v-alert>
        <div v-if="isLoading" class="text-center pa-4">
          <v-progress-circular indeterminate color="primary"></v-progress-circular>
          <div class="mt-2">正在加载设备列表...</div>
        </div>
        <div v-else-if="deviceList.length === 0" class="text-center pa-4">
          <v-btn variant="outlined" block @click="addDevice" class="mb-4">
            <v-icon left>mdi-cellphone-link</v-icon>
            添加 USB 设备
          </v-btn>
          <v-list-item
            prepend-icon="mdi-cellphone-android"
            title="未检测到设备"
            subtitle="请确保设备已开启USB调试模式并连接到电脑"
          />
        </div>
        <v-list v-else>
          <v-list-subheader>可用设备 ({{ deviceList.length }})</v-list-subheader>
          <v-list-item
            v-for="device in deviceList"
            :key="device.serial"
            @click="selectDevice(device)"
            class="mb-2"
          >
            <template #prepend>
              <v-avatar color="primary" size="40">
                <v-icon color="white" size="24">mdi-cellphone</v-icon>
              </v-avatar>
            </template>
            <v-list-item-title>
              {{ device.name || device.serial }}
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ device.serial }}
            </v-list-item-subtitle>
            <template #append>
              <v-icon>mdi-chevron-right</v-icon>
            </template>
          </v-list-item>
          <v-divider class="my-2"></v-divider>
          <v-list-item @click="addDevice">
            <template #prepend>
              <v-avatar color="grey" size="40">
                <v-icon color="white" size="24">mdi-plus</v-icon>
              </v-avatar>
            </template>
            <v-list-item-title>添加新设备</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>
  </v-navigation-drawer>
</template>

<style lang="scss" scoped>
.device-drawer {
  max-height: 80vh;
  border-radius: 0 0 16px 16px;
  
  :deep(.v-navigation-drawer__content) {
    border-radius: 0 0 16px 16px;
    overflow: hidden;
  }
}
</style> 