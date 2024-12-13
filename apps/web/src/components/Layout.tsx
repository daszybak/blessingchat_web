import { Link, Outlet } from "react-router-dom";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "./ui/sidebar";

interface openAiSidebarItem {
    to: string;
    label: string;
}

const openAiItems: openAiSidebarItem[] = [
    {
        to: "/",
        label: "Pričaj s Biblijom"
    }
]

const Layout = () => {
    return (
        <SidebarProvider>
            <Sidebar>
                <SidebarHeader />
                <SidebarContent>
                    <SidebarGroup>
                        <SidebarGroupLabel>Biblija</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {
                                    openAiItems.map(({ label, to }) => {
                                        return (
                                            <SidebarMenuItem key={label}>
                                                <SidebarMenuButton asChild>
                                                    <Link to={to}>
                                                        {label}
                                                    </Link>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        )
                                    })
                                }
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                </SidebarContent>
                <SidebarFooter />
            </Sidebar>
            <main className="flex flex-col flex-1 min-h-svh max-h-svh">
                <SidebarTrigger />
                <div className="p-8 w-full flex flex-1 flex-col h-full">
                    <Outlet />
                </div>
            </main>
        </SidebarProvider>
    )
}

export default Layout;
