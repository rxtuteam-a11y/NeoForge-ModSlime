package vn.modslime.fix.mixin;

import net.neoforged.neoforge.common.ModConfigSpec;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Thư viện Platform (dùng bởi VanillaBackport) đọc config ở tick đầu tiên của client.
 * Trên máy chậm, tick đó đến trước khi NeoForge nạp xong config -> ModConfigSpec ném
 * IllegalStateException("Cannot get config value before config is loaded") và game crash.
 * Vá: nếu config chưa nạp thì trả về giá trị mặc định; nạp xong thì chạy như bình thường.
 */
@Pseudo
@Mixin(targets = "com.blackgear.platform.core.util.config.neoforge.ForgeConfigValue", remap = false)
public abstract class ForgeConfigValueMixin {
    @Shadow(remap = false) @Final private ModConfigSpec.ConfigValue<Object> value;

    @Inject(method = "get()Ljava/lang/Object;", at = @At("HEAD"), cancellable = true, remap = false)
    private void modslime$getDefaultIfNotLoaded(CallbackInfoReturnable<Object> cir) {
        try {
            this.value.get();
        } catch (IllegalStateException notLoadedYet) {
            cir.setReturnValue(this.value.getDefault());
        }
    }
}
