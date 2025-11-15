// 超时装饰器
export function Timeout(ms: number, message?: string) {
	return function (
		target: any,
		propertyKey: string | symbol,
		descriptor: PropertyDescriptor
	): PropertyDescriptor {
		const originalMethod = descriptor.value;
		const methodName = propertyKey.toString();
		descriptor.value = async function (...args: any[]) {
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => {
					reject(new Error(message || `${methodName}超时: ${ms}ms`));
				}, ms);
			});
			return Promise.race([
				originalMethod.apply(this, args),
				timeoutPromise
			]);
		};
		return descriptor;
	};
}
