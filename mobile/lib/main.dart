import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'screens/home_shell.dart';
import 'screens/login_screen.dart';
import 'state/auth_provider.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ChangeNotifierProvider(
      create: (_) => AuthProvider()..bootstrap(),
      child: const UlmsApp(),
    ),
  );
}

class UlmsApp extends StatelessWidget {
  const UlmsApp({super.key});

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF1D4ED8);
    return MaterialApp(
      title: 'ULMS',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: seed),
        appBarTheme: const AppBarTheme(centerTitle: false),
        inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(seedColor: seed, brightness: Brightness.dark),
        inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
      ),
      // The session decides the screen; no manual navigation on sign-in/out.
      home: Consumer<AuthProvider>(
        builder: (context, auth, _) {
          switch (auth.status) {
            case AuthStatus.loading:
              return const Scaffold(body: Center(child: CircularProgressIndicator()));
            case AuthStatus.signedOut:
              return const LoginScreen();
            case AuthStatus.signedIn:
              return const HomeShell();
          }
        },
      ),
    );
  }
}
