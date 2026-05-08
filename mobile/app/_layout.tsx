import FontAwesome from '@expo/vector-icons/FontAwesome'
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import 'react-native-reanimated'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useColorScheme } from '@/components/useColorScheme'
import { Colors, IOS } from '../src/theme/colors'

export { ErrorBoundary } from 'expo-router'

export const unstable_settings = {
  initialRouteName: '(tabs)',
}

SplashScreen.preventAutoHideAsync()

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30000 } } })

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: IOS.bg,
    primary: Colors.primary,
    card: IOS.card,
    text: IOS.label,
    border: IOS.separator,
  },
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  })

  useEffect(() => { if (error) throw error }, [error])
  useEffect(() => { if (loaded) SplashScreen.hideAsync() }, [loaded])

  if (!loaded) return null

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={theme}>
        <Stack
          screenOptions={{
            headerBackTitle: '返回',
            headerTintColor: Colors.primary,
            headerStyle: { backgroundColor: IOS.card },
            headerTitleStyle: { fontWeight: '700', color: IOS.label },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: IOS.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
