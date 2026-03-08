import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { setAuthCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
    try {
        const { email, password, confirmPassword } = await request.json();

        if (!email || !password || !confirmPassword) {
            return NextResponse.json(
                { error: "Email, password, and password confirmation are required" },
                { status: 400 }
            );
        }

        if (password.length < 6) {
            return NextResponse.json(
                { error: "Password must be at least 6 characters" },
                { status: 400 }
            );
        }

        if (password !== confirmPassword) {
            return NextResponse.json(
                { error: "Passwords do not match" },
                { status: 400 }
            );
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { error: "Please enter a valid email address" },
                { status: 400 }
            );
        }

        const password_hash = await bcrypt.hash(password, 12);

        const { data, error } = await supabase
            .from("users")
            .insert({
                email: email.toLowerCase().trim(),
                password_hash,
                is_admin: false,
                has_projections_access: false,
            })
            .select("id, is_admin, has_projections_access")
            .single();

        if (error) {
            if (error.code === "23505") {
                return NextResponse.json(
                    { error: "An account with that email already exists" },
                    { status: 409 }
                );
            }
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        // Auto-login: set auth cookie for the newly created user
        await setAuthCookie(data.id, data.is_admin, data.has_projections_access);

        return NextResponse.json({ success: true }, { status: 201 });
    } catch (error) {
        console.error("Registration error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
