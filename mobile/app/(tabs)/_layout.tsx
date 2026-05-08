import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs } from 'expo-router'
import { Colors, IOS } from '../../src/theme/colors'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: IOS.label2,
        tabBarStyle: {
          backgroundColor: IOS.card,
          borderTopColor: IOS.separator,
          borderTopWidth: 0.5,
          height: 84,
          paddingBottom: 28,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '首页',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={24} color={color} style={{ marginBottom: -3 }} />
          ),
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: '项目',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'folder' : 'folder-outline'} size={24} color={color} style={{ marginBottom: -3 }} />
          ),
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: 'AI',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'sparkles' : 'sparkles-outline'} size={24} color={color} style={{ marginBottom: -3 }} />
          ),
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: '财务',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'wallet' : 'wallet-outline'} size={24} color={color} style={{ marginBottom: -3 }} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: '更多',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'ellipsis-horizontal' : 'ellipsis-horizontal-outline'} size={24} color={color} style={{ marginBottom: -3 }} />
          ),
        }}
      />
    </Tabs>
  )
}
