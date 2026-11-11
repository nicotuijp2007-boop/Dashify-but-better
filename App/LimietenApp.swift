import SwiftUI

@main
struct LimietenApp: App {
    @State private var model = AppModel.live()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(model)
        }
    }
}
