import Spinner from './Spinner';
import styles from './Button.module.css';

export default function Button({
  variant = 'primary',
  fullWidth = false,
  loading = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  const classes = [styles.btn, styles[variant], fullWidth ? styles.fullWidth : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading && <Spinner size={16} />}
      {children}
    </button>
  );
}
